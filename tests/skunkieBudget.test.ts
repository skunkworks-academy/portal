import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSkunkieBudgetService, SKUNKIE_BUDGET_MODEL, SKUNKIE_MAX_MONTHLY_RESERVATIONS, SKUNKIE_MONTHLY_LIMIT_NANOS, SkunkieBudgetService, skunkieBudgetAccountKey, skunkieBudgetMonth, skunkieTokenCostNanos, type SkunkieReservationRequest } from "../api/skunkieBudget.js";
import type { BudgetStoreDocument, BudgetStoreRecord, SkunkieBudgetStore } from "../api/skunkieBudgetStore.js";

const principal = { tenantId: "11111111-1111-1111-1111-111111111111", subject: "verified-subject" };
const at = (value = "2026-11-06T10:00:00Z") => () => new Date(value);
const request = (maxInputTokens = 1000, maxOutputTokens = 900): SkunkieReservationRequest => ({ requestId: randomUUID(), model: SKUNKIE_BUDGET_MODEL, maxInputTokens, maxOutputTokens });

/** Test-only atomic storage shared between independent service instances. */
class AtomicStore implements SkunkieBudgetStore {
  records = new Map<string, BudgetStoreRecord>();
  revision = 0;
  conflicts = 0;
  fail: "read" | "before-write" | "after-write" | null = null;
  private key(id: string, organizationId: string) { return JSON.stringify([organizationId, id]); }
  async read(id: string, organizationId: string) {
    if (this.fail === "read") throw Error("private storage failure");
    return structuredClone(this.records.get(this.key(id, organizationId)) ?? null);
  }
  private write(document: BudgetStoreDocument, previous: string | null) {
    if (this.fail === "before-write") throw Error("private storage failure");
    const key = this.key(document.id, document.organizationId);
    const current = this.records.get(key);
    if ((current?.etag ?? null) !== previous) { this.conflicts++; return false; }
    this.records.set(key, { document: structuredClone(document), etag: `"${++this.revision}"` });
    if (this.fail === "after-write") throw Error("response lost after durable commit");
    return true;
  }
  async create(document: BudgetStoreDocument) { return this.write(document, null); }
  async replace(document: BudgetStoreDocument, etag: string) { return this.write(document, etag); }
}

describe("durable per-account monthly Skunkie model allowance", () => {
  it("uses exact integer pricing and does not discount cached input", () => {
    expect(skunkieTokenCostNanos({ inputTokens: 123, outputTokens: 45 })).toBe(121200);
    expect(skunkieTokenCostNanos({ inputTokens: 2500000, outputTokens: 0 })).toBe(SKUNKIE_MONTHLY_LIMIT_NANOS);
    for (const count of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      expect(() => skunkieTokenCostNanos({ inputTokens: count, outputTokens: 1 })).toThrow();
    }
  });

  it("reserves before dispatch and settles the actual cost exactly once", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const config = request();
    const result = await service.reserve(principal, config);
    expect(result.mayDispatch).toBe(true);
    expect(result.budget.usedNanos).toBe(1840000);
    expect(result.budget.resetsAt).toBe("2026-11-30T22:00:00.000Z");
    const settled = await service.settle(principal, result.reservation, { inputTokens: 123, outputTokens: 45 });
    expect(settled.usedNanos).toBe(121200);
    const revision = store.revision;
    expect(await service.settle(principal, result.reservation, { inputTokens: 123, outputTokens: 45 })).toEqual(settled);
    expect(store.revision).toBe(revision);
    await expect(service.settle(principal, result.reservation, { inputTokens: 122, outputTokens: 45 })).rejects.toMatchObject({ status: 409 });
    expect((await service.reserve(principal, config)).mayDispatch).toBe(false);
  });

  it("enforces an exact US$1 cap, including outstanding reservations", async () => {
    const service = new SkunkieBudgetService(new AtomicStore(), "academy", at());
    const exact = await service.reserve(principal, request(2499996, 1));
    expect(exact.budget).toMatchObject({ usedNanos: 1000000000, remainingNanos: 0 });
    await expect(service.reserve(principal, request(0, 1))).rejects.toMatchObject({ status: 429 });
    expect((await service.read(principal)).usedNanos).toBe(1000000000);
  });

  it("does not overspend when separate service instances race on create and replacement", async () => {
    const store = new AtomicStore();
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () =>
      new SkunkieBudgetService(store, "academy", at()).reserve(principal, request(124996, 1))));
    const allowed = outcomes.filter(result => result.status === "fulfilled");
    // Each reservation costs 50,000,000 nanos. Exactly twenty fit.
    expect(allowed).toHaveLength(20);
    expect(store.conflicts).toBeGreaterThan(0);
    const newWorker = new SkunkieBudgetService(store, "academy", at());
    expect((await newWorker.read(principal)).usedNanos).toBe(1000000000);
    await expect(newWorker.reserve(principal, request(0, 1))).rejects.toMatchObject({ status: 429 });
  });

  it("allows only one provider dispatch for racing copies of the same request ID", async () => {
    const store = new AtomicStore();
    const config = request();
    const results = await Promise.all(Array.from({ length: 8 }, () => new SkunkieBudgetService(store, "academy", at()).reserve(principal, config)));
    expect(results.filter(result => result.mayDispatch)).toHaveLength(1);
    expect((await new SkunkieBudgetService(store, "academy", at()).read(principal)).usedNanos).toBe(1840000);
    await expect(new SkunkieBudgetService(store, "academy", at()).reserve(principal, { ...config, maxOutputTokens: 1000 })).rejects.toMatchObject({ status: 409 });
  });

  it("admits only two concurrent full-context holds and releases affordability only after verified usage", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const results = await Promise.allSettled(Array.from({ length: 3 }, () =>
      new SkunkieBudgetService(store, "academy", at()).reserve(principal, request(1048576, 900))));
    const admitted = results.filter(result => result.status === "fulfilled").map(result => result.value);
    expect(admitted).toHaveLength(2);
    expect(results.filter(result => result.status === "rejected").map(result => result.reason.status)).toEqual([429]);
    expect((await service.read(principal)).usedNanos).toBe(841740800);
    await service.settle(principal, admitted[0].reservation, { inputTokens: 200, outputTokens: 100 });
    expect((await service.reserve(principal, request(1048576, 900))).mayDispatch).toBe(true);
    expect((await service.read(principal)).usedNanos).toBe(841980800);
  });

  it("retains an ambiguous reservation across crashes and refuses a replay dispatch", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const config = request();
    store.fail = "after-write";
    await expect(service.reserve(principal, config)).rejects.toMatchObject({ status: 503 });
    store.fail = null;
    const restarted = new SkunkieBudgetService(store, "academy", at());
    const retry = await restarted.reserve(principal, config);
    expect(retry.mayDispatch).toBe(false);
    expect(retry.budget.usedNanos).toBe(1840000);
    // Provider timeout/no usage: there is deliberately no release operation.
    await expect(restarted.settle(principal, retry.reservation, { inputTokens: Number.NaN, outputTokens: 1 })).rejects.toMatchObject({ status: 502 });
    expect((await restarted.read(principal)).usedNanos).toBe(1840000);
  });

  it("makes settlement retry-safe after its response is lost", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const { reservation } = await service.reserve(principal, request());
    store.fail = "after-write";
    await expect(service.settle(principal, reservation, { inputTokens: 100, outputTokens: 20 })).rejects.toMatchObject({ status: 503 });
    store.fail = null;
    const settled = await new SkunkieBudgetService(store, "academy", at()).settle(principal, reservation, { inputTokens: 100, outputTokens: 20 });
    expect(settled.usedNanos).toBe(72000);
    expect(store.revision).toBe(2);
  });

  it("keeps concurrent settlements and new reservations from losing each other's accounting", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const reservations = await Promise.all(Array.from({ length: 8 }, () => service.reserve(principal, request())));
    await Promise.all([
      ...reservations.flatMap(({ reservation }) => Array.from({ length: 2 }, () =>
        new SkunkieBudgetService(store, "academy", at()).settle(principal, reservation, { inputTokens: 100, outputTokens: 10 }))),
      service.reserve(principal, request())
    ]);
    expect((await service.read(principal)).usedNanos).toBe(8 * 56000 + 1840000);
  });

  it("does not release anything when a settlement fails before the write", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const { reservation } = await service.reserve(principal, request());
    store.fail = "before-write";
    await expect(service.settle(principal, reservation, { inputTokens: 10, outputTokens: 1 })).rejects.toMatchObject({ status: 503 });
    store.fail = null;
    expect((await service.read(principal)).usedNanos).toBe(1840000);
  });

  it("separates tenants, subjects and organization partitions without storing identity or messages", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    const { reservation } = await service.reserve(principal, request());
    const external = { ...principal, tenantId: "22222222-2222-2222-2222-222222222222" };
    expect((await service.read(external)).usedNanos).toBe(0);
    expect((await service.reserve(external, request())).mayDispatch).toBe(true);
    expect((await service.read({ ...principal, subject: "other-subject" })).usedNanos).toBe(0);
    expect((await new SkunkieBudgetService(store, "other-org", at()).read(principal)).usedNanos).toBe(0);
    await expect(service.settle(external, reservation, { inputTokens: 1, outputTokens: 1 })).rejects.toMatchObject({ status: 403 });
    const persisted = JSON.stringify([...store.records.values()]);
    expect(persisted).not.toContain(principal.subject);
    expect(persisted).not.toContain(principal.tenantId);
    expect(skunkieBudgetAccountKey(principal)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => skunkieBudgetAccountKey({ subject: "unverified" })).toThrow();
  });

  it("rolls over at Johannesburg midnight and settles an old request in the old month", async () => {
    let current = "2026-11-30T21:59:59.999Z";
    const service = new SkunkieBudgetService(new AtomicStore(), "academy", () => new Date(current));
    const old = await service.reserve(principal, request());
    current = "2026-11-30T22:00:00.000Z";
    expect(await service.read(principal)).toMatchObject({ month: "2026-12", usedNanos: 0, resetsAt: "2026-12-31T22:00:00.000Z" });
    expect((await service.settle(principal, old.reservation, { inputTokens: 10, outputTokens: 10 })).month).toBe("2026-11");
    expect((await service.read(principal)).usedNanos).toBe(0);
    expect(skunkieBudgetMonth(new Date("2026-12-31T22:00:00Z"))).toBe("2027-01");
    expect(skunkieBudgetMonth(new Date("2028-02-29T22:00:00Z"))).toBe("2028-03");
  });

  it("records and freezes unexpected trusted usage above the reserved bounds", async () => {
    const service = new SkunkieBudgetService(new AtomicStore(), "academy", at());
    const { reservation } = await service.reserve(principal, request(1, 1));
    const settled = await service.settle(principal, reservation, { inputTokens: 1, outputTokens: 2 });
    expect(settled).toMatchObject({ usedNanos: 3600, remainingNanos: 0, blocked: true });
    await expect(service.reserve(principal, request())).rejects.toMatchObject({ status: 503 });
    expect(await service.settle(principal, reservation, { inputTokens: 1, outputTokens: 2 })).toEqual(settled);
  });

  it("fails closed for missing config, read outages and corrupted stored totals", async () => {
    expect(() => createSkunkieBudgetService({})).toThrow();
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    store.fail = "read";
    await expect(service.reserve(principal, request())).rejects.toMatchObject({ status: 503 });
    expect(store.records.size).toBe(0);
    store.fail = null;
    await service.reserve(principal, request());
    const stored = [...store.records.values()][0];
    (stored.document.value as { usedNanos: number }).usedNanos = 0;
    await expect(service.read(principal)).rejects.toMatchObject({ status: 503 });
    await expect(service.reserve(principal, request())).rejects.toMatchObject({ status: 503 });
  });

  it("caps monthly entry growth while preserving settled IDs and staying below the Cosmos document limit", async () => {
    const store = new AtomicStore();
    const service = new SkunkieBudgetService(store, "academy", at());
    await service.reserve(principal, request(0, 1));
    const record = [...store.records.values()][0];
    const ledger = record.document.value as { reservations: unknown[]; usedNanos: number };
    ledger.reservations = Array.from({ length: SKUNKIE_MAX_MONTHLY_RESERVATIONS }, () => ({
      ...request(0, 1), reservedNanos: 1600, state: "settled", usage: { inputTokens: 0, outputTokens: 0 }
    }));
    ledger.usedNanos = 0;
    expect(Buffer.byteLength(JSON.stringify(record.document))).toBeLessThan(1500000);
    expect(await service.read(principal)).toMatchObject({ usedNanos: 0, remainingNanos: 1000000000, requestLimitReached: true });
    await expect(service.reserve(principal, request(0, 1))).rejects.toMatchObject({ status: 429 });
    expect(store.revision).toBe(1);
  });
});

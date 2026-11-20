import { describe, it, expect, vi } from "vitest";
import { HttpRequest } from "@azure/functions";
import { createContactHandlers, validateContact } from "../api/contactFunctions.js";
import { HttpError } from "../api/http.js";
import type { CosmosLmsStore } from "../api/lmsCosmosStore.js";
const data = { id: "4174be57-ea85-40ac-a8ac-ff6acb5fe690", name: "Synthetic Test", email: "synthetic@example.invalid", topic: "general", message: "Synthetic contact enquiry; no response needed." };
const request = (body: unknown = data, origin = "https://www.skunkworksacademy.com", method = "POST") => new HttpRequest({ method, url: "https://api.skunkworksacademy.com/api/contact/enquiries", headers: { origin, "content-type": "application/json" }, ...(method === "POST" ? { body: { string: JSON.stringify(body) } } : {}) });
function setup() {
  const records = new Map<string, { value: unknown; etag: string }>();
  const store = {
    get: vi.fn(async <T>(c: string, k: string) => (records.get(c + k)?.value as T) ?? null),
    getWithEtag: vi.fn(async <T>(c: string, k: string) => records.get(c + k) as { value: T; etag: string } ?? null),
    put: vi.fn(async <T>(c: string, k: string, value: T, options?: { ifAbsent?: boolean }) => { if (options?.ifAbsent && records.has(c + k)) throw new HttpError(409, "Conflict"); records.set(c + k, { value, etag: '"1"' }); }),
    putIfMatch: vi.fn(async <T>(c: string, k: string, value: T, etag: string) => { if (records.get(c + k)?.etag !== etag) throw new HttpError(409, "Conflict"); records.set(c + k, { value, etag: '"' + (Number(etag.replaceAll('"', '')) + 1) + '"' }); }),
    list: vi.fn(async <T>(c: string, prefix: string) => [...records.entries()].filter(([key]) => key.startsWith(c + prefix)).map(([, r]) => r.value as T))
  };
  const authenticate = vi.fn(async () => ({ subject: "test", tenantId: "home", roles: ["Portal.Staff"], name: "Test", email: "staff@example.invalid" }));
  const handlers = createContactHandlers({ store: () => store as unknown as CosmosLmsStore, organization: () => "academy", authenticate, now: () => new Date("2026-11-20T10:00:00Z") });
  return { ...handlers, store, records, authenticate };
}
describe("private website enquiries", () => {
  it("captures and reads back before success; staff can retrieve the saved record without internal digest", async () => {
    const s = setup(); const result = await s.submit(request()); expect(result.status).toBe(201);
    expect(result.jsonBody).toEqual({ received: true, reference: data.id });
    expect(s.store.put).toHaveBeenCalledWith("contact-enquiries-v1", `academy:${data.id}`, expect.objectContaining(data), { ifAbsent: true, ttl: -1 });
    const inbox = await s.inbox(request(undefined, "https://portal.skunkworksacademy.com", "GET"));
    expect(inbox.status).toBe(200); expect(inbox.jsonBody).toEqual([expect.objectContaining(data)]); expect(inbox.jsonBody).not.toEqual([expect.objectContaining({ digest: expect.anything() })]);
  });
  it("retry returns the same reference without duplicate records", async () => {
    const s = setup(); await s.submit(request()); expect((await s.submit(request())).status).toBe(200);
    expect([...s.records.keys()].filter(k => k.startsWith("contact-enquiries-v1"))).toHaveLength(1);
  });
  it("cannot change a saved record by reusing its reference", async () => {
    const s = setup(); await s.submit(request()); expect((await s.submit(request({ ...data, message: "Different synthetic message" }))).status).toBe(409);
  });
  it("never claims success when storage fails", async () => {
    const s = setup(); s.store.put.mockRejectedValue(new Error("secret database details"));
    const result = await s.submit(request()); expect(result.status).toBe(503); expect(JSON.stringify(result)).not.toContain("secret database");
  });
  it("does not claim success without readback", async () => {
    const s = setup(); s.store.get.mockResolvedValue(null); expect((await s.submit(request())).status).toBe(503);
  });
  it("rejects unauthenticated staff reads before touching storage", async () => {
    const s = setup(); s.authenticate.mockRejectedValue(new HttpError(401, "Sign in required"));
    expect((await s.inbox(request())).status).toBe(401); expect(s.store.list).not.toHaveBeenCalled();
  });
  it("rejects callers without staff permission", async () => {
    const s = setup(); s.authenticate.mockRejectedValue(new HttpError(403, "Staff required")); expect((await s.inbox(request())).status).toBe(403);
  });
  it.each(["https://evil.example", "null", ""])("rejects origin %s", async origin => { const s = setup(); expect((await s.submit(request(data, origin))).status).toBe(403); expect(s.store.put).not.toHaveBeenCalled(); });
  it("preflights the production contact origin", async () => { const s = setup(); const r = await s.submit(request(undefined, "https://www.skunkworksacademy.com", "OPTIONS")); expect(r.status).toBe(204); expect(r.headers).toMatchObject({ "Access-Control-Allow-Origin": "https://www.skunkworksacademy.com" }); });
  it.each([{ email: "bad" }, { topic: "unknown" }, { message: "short" }, { website: "bot" }, { name: " " }, { message: "a".repeat(5001) }, { id: "bad" }])("validates %j", async update => { expect(() => validateContact({ ...data, ...update })).toThrow(); });
  it("enforces an hourly sender limit in durable storage", async () => {
    const s = setup(); for (let n = 0; n < 5; n++) expect((await s.submit(request({ ...data, id: `4174be57-ea85-40ac-a8ac-ff6acb5fe69${n}` }))).status).toBe(201);
    expect((await s.submit(request({ ...data, id: "4174be57-ea85-40ac-a8ac-ff6acb5fe699" }))).status).toBe(429);
  });
  it("rate-limit conflicts fail closed", async () => {
    const s = setup(); s.store.put.mockRejectedValue(new HttpError(409, "Conflict")); expect((await s.submit(request())).status).toBe(503);
  });
});

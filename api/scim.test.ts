import { afterEach, describe, expect, it } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";
import { issueScimToken, verifyScimToken } from "./scimAuth.js";
import { ScimError, ScimService, type ScimStore, USER_SCHEMA } from "./scimDomain.js";

class MemoryStore implements ScimStore {
  private values = new Map<string, unknown>();
  private versions = new Map<string, number>();
  async get<T>(collection: string, key: string): Promise<T | null> {
    return (this.values.get(collection + ":" + key) as T | undefined) ?? null;
  }
  async put<T>(collection: string, key: string, value: T, options?: { ifAbsent?: boolean }) {
    const k = collection + ":" + key;
    if (options?.ifAbsent && this.values.has(k)) throw Error("conflict");
    this.values.set(k, structuredClone(value));
    this.versions.set(k, (this.versions.get(k) ?? 0) + 1);
  }
  async getWithEtag<T>(collection: string, key: string): Promise<{ value: T; etag: string } | null> {
    const value = await this.get<T>(collection, key);
    return value === null ? null : { value: structuredClone(value), etag: String(this.versions.get(collection + ":" + key)) };
  }
  async putIfMatch<T>(collection: string, key: string, value: T, etag: string): Promise<void> {
    if (String(this.versions.get(collection + ":" + key)) !== etag) throw Error("conflict");
    await this.put(collection, key, value);
  }
  async list<T>(collection: string, prefix: string): Promise<T[]> {
    return [...this.values.entries()].filter(([key]) => key.startsWith(collection + ":" + prefix)).map(([, value]) => value as T);
  }
  async delete(collection: string, key: string): Promise<void> {
    this.values.delete(collection + ":" + key);
    this.versions.delete(collection + ":" + key);
  }
}
const base = "https://api.skunkworksacademy.com/api/scim/v2";
function user(userName = "learner@example.org", externalId = "entra-user-001") {
  return { schemas: [USER_SCHEMA], userName, externalId,
    name: { givenName: "Alex", familyName: "Learner" },
    emails: [{ value: userName, type: "work", primary: true }], active: true };
}
afterEach(() => {
  for (const key of ["SCIM_ENABLED", "SCIM_PUBLIC_BASE_URL", "SCIM_TOKEN_SIGNING_KEY", "SCIM_CLIENTS_JSON"]) delete process.env[key];
});
describe("SCIM 2.0 tenant scoped lifecycle", () => {
  it("isolates two organizations and returns an empty successful filter result", async () => {
    const store = new MemoryStore();
    const a = new ScimService(store, "orgA", base);
    const b = new ScimService(store, "orgB", base);
    const created = await a.create("Users", user()) as { id: string };
    expect(created.id).toBeTruthy();
    expect((await a.list("Users", 'userName eq "missing@example.org"', 1, 100)).totalResults).toBe(0);
    expect((await b.list("Users", null, 1, 100)).totalResults).toBe(0);
    await expect(b.get("Users", created.id)).rejects.toMatchObject({ status: 404 });
    expect((await a.list("Users", 'emails[type eq "work"].value eq "learner@example.org"', 1, 100)).totalResults).toBe(1);
  });
  it("supports deactivation, reactivation, PUT, deterministic retries and pagination", async () => {
    const svc = new ScimService(new MemoryStore(), "academy", base);
    const c = await svc.create("Users", user()) as { id: string };
    await expect(svc.create("Users", user())).rejects.toMatchObject({ status: 409 });
    await svc.patch("Users", c.id, { Operations: [
      { op: "Replace", path: "active", value: false },
      { op: "Replace", path: "name.givenName", value: "Sam" }
    ] });
    expect(await svc.get("Users", c.id)).toMatchObject({ active: false, name: { givenName: "Sam" } });
    await svc.remove("Users", c.id);
    expect((await svc.list("Users", 'externalId eq "entra-user-001"', 1, 10)).totalResults).toBe(1);
    await svc.replace("Users", c.id, user("new@example.org"));
    expect(await svc.get("Users", c.id)).toMatchObject({ id: c.id, userName: "new@example.org", active: true });
    expect((await svc.list("Users", null, 1, 0)).Resources).toEqual([]);
  });
  it("supports multiple group members in one PATCH and rejects foreign members", async () => {
    const svc = new ScimService(new MemoryStore(), "academy", base);
    const u1 = await svc.create("Users", user("one@example.org", "oid-one")) as { id: string };
    const u2 = await svc.create("Users", user("two@example.org", "oid-two")) as { id: string };
    const g = await svc.create("Groups", { displayName: "Cohort 1", externalId: "group-oid" }) as { id: string };
    await svc.patch("Groups", g.id, { Operations: [
      { op: "Add", path: "members", value: [{ value: u1.id }, { value: u2.id }] }
    ] });
    expect((await svc.get("Groups", g.id) as { members: unknown[] }).members).toHaveLength(2);
    await svc.patch("Groups", g.id, { Operations: [{ op: "Remove", path: "members", value: [{ value: u1.id }] }] });
    expect((await svc.get("Groups", g.id) as { members: unknown[] }).members).toHaveLength(1);
    await expect(svc.patch("Groups", g.id, { Operations: [
      { op: "Add", path: "members", value: [{ value: "a0000000-0000-0000-0000-000000000000" }] }
    ] })).rejects.toMatchObject({ status: 400 });
    await svc.remove("Groups", g.id);
    await expect(svc.get("Groups", g.id)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects one of two simultaneous stale group membership PATCHes instead of silently losing a write", async () => {
    const store = new MemoryStore();
    const svc = new ScimService(store, "academy", base);
    const first = await svc.create("Users", user("first@example.org", "oid-first")) as { id: string };
    const second = await svc.create("Users", user("second@example.org", "oid-second")) as { id: string };
    const group = await svc.create("Groups", { displayName: "Parallel class", externalId: "parallel-group" }) as { id: string };
    const attempts = await Promise.allSettled([
      svc.patch("Groups", group.id, { Operations: [{ op: "Add", path: "members", value: [{ value: first.id }] }] }),
      svc.patch("Groups", group.id, { Operations: [{ op: "Add", path: "members", value: [{ value: second.id }] }] })
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(attempts.find(result => result.status === "rejected")).toMatchObject({
      reason: { status: 409 }
    });
    expect((await svc.get("Groups", group.id) as { members: unknown[] }).members).toHaveLength(1);
  });
  it("rejects unsupported patch paths and filters without changing resources", async () => {
    const svc = new ScimService(new MemoryStore(), "academy", base);
    const c = await svc.create("Users", user()) as { id: string };
    await expect(svc.patch("Users", c.id, { Operations: [
      { op: "Replace", path: "active", value: false },
      { op: "Replace", path: "roles", value: ["Portal.Admin"] }
    ] })).rejects.toMatchObject({ status: 400 });
    expect(await svc.get("Users", c.id)).toMatchObject({ active: true });
    await expect(svc.list("Users", 'roles eq "Portal.Admin"', 1, 10)).rejects.toMatchObject({ status: 400, scimType: "invalidFilter" });
  });
});
describe("SCIM OAuth 2.0 token security", () => {
  it("rejects malformed four-segment tenant identifiers at configuration time", async () => {
    const secret = randomBytes(32).toString("base64url");
    const salt = randomBytes(16);
    process.env.SCIM_ENABLED = "true";
    process.env.SCIM_PUBLIC_BASE_URL = base;
    process.env.SCIM_TOKEN_SIGNING_KEY = randomBytes(32).toString("base64url");
    process.env.SCIM_CLIENTS_JSON = JSON.stringify([{
      clientId: "bad-tenant", organizationId: "pilot",
      entraTenantId: "338a8916-80d9-467c-7f61d04ef7d5",
      enabled: true, secretHashes: [{
        salt: salt.toString("hex"), hash: scryptSync(secret, salt, 64).toString("hex"),
        expiresAt: "2028-10-01T00:00:00Z"
      }]
    }]);
    await expect(issueScimToken("bad-tenant", secret)).rejects.toMatchObject({ status: 503 });
  });
  it("issues five-minute tenant-bound tokens only for the configured client", async () => {
    const secret = randomBytes(32).toString("base64url");
    const salt = randomBytes(16);
    const hash = scryptSync(secret, salt, 64).toString("hex");
    process.env.SCIM_ENABLED = "true";
    process.env.SCIM_PUBLIC_BASE_URL = base;
    process.env.SCIM_TOKEN_SIGNING_KEY = randomBytes(32).toString("base64url");
    process.env.SCIM_CLIENTS_JSON = JSON.stringify([{
      clientId: "academy-pilot", organizationId: "pilot", entraTenantId: "338a8916-80d9-467c-a94a-7f61d04ef7d5",
      enabled: true, secretHashes: [{ salt: salt.toString("hex"), hash, expiresAt: "2028-10-01T00:00:00Z" }]
    }]);
    await expect(issueScimToken("academy-pilot", "incorrect")).rejects.toMatchObject({ status: 401 });
    const issued = await issueScimToken("academy-pilot", secret);
    expect(issued.expires_in).toBe(300);
    expect(await verifyScimToken("Bearer " + issued.access_token)).toMatchObject({ organizationId: "pilot", clientId: "academy-pilot" });
    await expect(verifyScimToken("Bearer " + issued.access_token.slice(0, -4) + "hack")).rejects.toMatchObject({ status: 401 });
    process.env.SCIM_ENABLED = "false";
    await expect(verifyScimToken("Bearer " + issued.access_token)).rejects.toBeInstanceOf(ScimError);
  });
});

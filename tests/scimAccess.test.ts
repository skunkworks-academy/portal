import { afterEach, describe, expect, it } from "vitest";
import { requireActiveScimUser } from "../api/scimAccess.js";
import type { ScimStore, ScimUser } from "../api/scimDomain.js";

class TestStore implements ScimStore {
  constructor(private users: ScimUser[] = []) {}
  async get<T>(): Promise<T | null> { return null; }
  async put<T>(): Promise<void> {}
  async delete(): Promise<void> {}
  async list<T>(_collection: string, prefix: string): Promise<T[]> {
    return this.users.filter(u => prefix === u.organizationId + ":") as T[];
  }
}
const active: ScimUser = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", organizationId: "org1",
  externalId: "b0b0b0b0-bbbb-cccc-dddd-eeeeeeeeeeee",
  userName: "student@example.org", active: true,
  createdAt: "2026-01-01T00:00:00Z", modifiedAt: "2026-01-01T00:00:00Z"
};
afterEach(() => delete process.env.SCIM_ENFORCE_PROVISIONED_USERS);
describe("optional LMS/Skunkie SCIM enforcement", () => {
  it("preserves current behaviour while explicitly disabled", async () => {
    process.env.SCIM_ENFORCE_PROVISIONED_USERS = "false";
    await expect(requireActiveScimUser(new TestStore(), "org1", "00000000-0000-0000-0000-000000000001")).resolves.toBeUndefined();
  });
  it("allows only active tenant-scoped users matched by immutable Entra oid", async () => {
    process.env.SCIM_ENFORCE_PROVISIONED_USERS = "true";
    const store = new TestStore([active]);
    await expect(requireActiveScimUser(store, "org1", active.externalId!)).resolves.toBeUndefined();
    await expect(requireActiveScimUser(store, "org2", active.externalId!)).rejects.toMatchObject({ status: 403 });
    await expect(requireActiveScimUser(store, "org1", "cccccccc-cccc-cccc-cccc-cccccccccccc")).rejects.toMatchObject({ status: 403 });
    await expect(requireActiveScimUser(new TestStore([{ ...active, active: false }]), "org1", active.externalId!)).rejects.toMatchObject({ status: 403 });
  });
});

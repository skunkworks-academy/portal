import { createHash } from "node:crypto";
import type { LmsStore } from "./lmsDomain.js";

export const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
export const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const safeOrg = /^[A-Za-z0-9_-]{1,100}$/;
const safeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxPage = 100;

export class ScimError extends Error {
  constructor(public status: number, message: string, public scimType?: string) { super(message); }
}
export interface ScimStore extends Pick<LmsStore, "get" | "put" | "list"> {
  delete(collection: string, key: string): Promise<void>;
  /** Optional in-memory test adapters can omit versioning; Cosmos implements both methods. */
  getWithEtag?<T>(collection: string, key: string): Promise<{ value: T; etag: string } | null>;
  putIfMatch?<T>(collection: string, key: string, value: T, etag: string): Promise<void>;
}
export type ScimUser = {
  id: string; organizationId: string; userName: string; externalId?: string;
  displayName?: string; name?: { givenName?: string; familyName?: string; formatted?: string };
  emails?: Array<{ value: string; type?: string; primary?: boolean }>;
  active: boolean; createdAt: string; modifiedAt: string;
};
export type ScimGroup = {
  id: string; organizationId: string; displayName: string; externalId?: string;
  members: Array<{ value: string; type: "User" }>; createdAt: string; modifiedAt: string;
};
type RecordValue = Record<string, unknown>;
type ResourceKind = "Users" | "Groups";
type ScimResource = ScimUser | ScimGroup;

function object(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ScimError(400, "Expected an object.", "invalidValue");
  return value as RecordValue;
}
function optionalString(value: unknown, field: string, max = 512): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > max) throw new ScimError(400, "Invalid " + field + ".", "invalidValue");
  return value;
}
function requiredString(value: unknown, field: string): string {
  const s = optionalString(value, field);
  if (!s?.trim()) throw new ScimError(400, "Missing " + field + ".", "invalidValue");
  return s;
}
function validId(id: string): string {
  if (!safeId.test(id)) throw new ScimError(404, "Resource not found.");
  return id.toLowerCase();
}
function key(org: string, id: string): string {
  if (!safeOrg.test(org)) throw new ScimError(403, "Invalid organization scope.");
  return org + ":" + validId(id);
}
function stableId(org: string, kind: ResourceKind, identity: string): string {
  // Entra externalId should be mapped to the immutable Entra objectId.
  const h = createHash("sha256").update(org + "|" + kind + "|" + identity.toLowerCase()).digest("hex");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-5" + h.slice(13, 16) + "-a" + h.slice(17, 20) + "-" + h.slice(20, 32);
}
function parseName(value: unknown): ScimUser["name"] {
  if (value === undefined || value === null) return undefined;
  const r = object(value);
  return {
    ...(optionalString(r.givenName, "name.givenName") !== undefined ? { givenName: optionalString(r.givenName, "name.givenName") } : {}),
    ...(optionalString(r.familyName, "name.familyName") !== undefined ? { familyName: optionalString(r.familyName, "name.familyName") } : {}),
    ...(optionalString(r.formatted, "name.formatted") !== undefined ? { formatted: optionalString(r.formatted, "name.formatted") } : {})
  };
}
function parseEmails(value: unknown): ScimUser["emails"] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 10) throw new ScimError(400, "Invalid emails.", "invalidValue");
  const out = value.map(v => {
    const r = object(v);
    const type = optionalString(r.type, "emails.type", 30);
    if (r.primary !== undefined && typeof r.primary !== "boolean") throw new ScimError(400, "Invalid emails.primary.", "invalidValue");
    return { value: requiredString(r.value, "emails.value"), ...(type !== undefined ? { type } : {}), ...(r.primary !== undefined ? { primary: r.primary as boolean } : {}) };
  });
  if (out.filter(e => e.type?.toLowerCase() === "work").length > 1) throw new ScimError(400, "Duplicate work email.", "invalidValue");
  return out;
}
function parseMembers(value: unknown): ScimGroup["members"] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 1000) throw new ScimError(400, "Invalid group members.", "invalidValue");
  const ids = value.map(m => validId(requiredString(object(m).value, "members.value")));
  return [...new Set(ids)].map(value => ({ value, type: "User" as const }));
}
function timestamp() { return new Date().toISOString(); }
function userInput(body: unknown, org: string, previous?: ScimUser): ScimUser {
  const r = object(body);
  const userName = requiredString(r.userName, "userName");
  const externalId = optionalString(r.externalId, "externalId");
  if (previous && externalId && externalId !== previous.externalId) throw new ScimError(409, "externalId is immutable.", "mutability");
  if (r.active !== undefined && typeof r.active !== "boolean") throw new ScimError(400, "active must be a boolean.", "invalidValue");
  const now = timestamp();
  return {
    id: previous?.id ?? stableId(org, "Users", externalId || userName),
    organizationId: org, userName,
    ...(externalId ?? previous?.externalId ? { externalId: externalId ?? previous?.externalId } : {}),
    ...(optionalString(r.displayName, "displayName") !== undefined ? { displayName: optionalString(r.displayName, "displayName") } : {}),
    ...(r.name !== undefined ? { name: parseName(r.name) } : {}),
    ...(r.emails !== undefined ? { emails: parseEmails(r.emails) } : {}),
    active: r.active === undefined ? previous?.active ?? true : r.active,
    createdAt: previous?.createdAt ?? now, modifiedAt: now
  };
}
function groupInput(body: unknown, org: string, previous?: ScimGroup): ScimGroup {
  const r = object(body);
  const displayName = requiredString(r.displayName, "displayName");
  const externalId = optionalString(r.externalId, "externalId");
  if (previous && externalId && externalId !== previous.externalId) throw new ScimError(409, "externalId is immutable.", "mutability");
  const now = timestamp();
  return {
    id: previous?.id ?? stableId(org, "Groups", externalId || displayName),
    organizationId: org, displayName,
    ...(externalId ?? previous?.externalId ? { externalId: externalId ?? previous?.externalId } : {}),
    members: r.members !== undefined ? parseMembers(r.members) : previous?.members ?? [],
    createdAt: previous?.createdAt ?? now, modifiedAt: now
  };
}
function publicUser(u: ScimUser, base: string) {
  return { schemas: [USER_SCHEMA], id: u.id, userName: u.userName, ...(u.externalId ? { externalId: u.externalId } : {}),
    ...(u.displayName !== undefined ? { displayName: u.displayName } : {}),
    ...(u.name ? { name: u.name } : {}), ...(u.emails ? { emails: u.emails } : {}), active: u.active,
    meta: { resourceType: "User", created: u.createdAt, lastModified: u.modifiedAt, location: base + "/Users/" + u.id } };
}
function publicGroup(g: ScimGroup, base: string, excludeMembers = false) {
  return { schemas: [GROUP_SCHEMA], id: g.id, displayName: g.displayName,
    ...(g.externalId ? { externalId: g.externalId } : {}),
    ...(excludeMembers ? {} : { members: g.members }),
    meta: { resourceType: "Group", created: g.createdAt, lastModified: g.modifiedAt, location: base + "/Groups/" + g.id } };
}
export function scimResponse(resource: ScimResource, base: string, excludeMembers = false) {
  return "userName" in resource ? publicUser(resource, base) : publicGroup(resource, base, excludeMembers);
}
function filterRecords<T extends ScimResource>(records: T[], kind: ResourceKind, filter?: string | null): T[] {
  if (!filter) return records;
  const m = /^(.+?)\s+eq\s+"([^"]{0,512})"$/i.exec(filter.trim());
  if (!m) throw new ScimError(400, "Unsupported SCIM filter.", "invalidFilter");
  const field = m[1].toLowerCase().replace(/\s+/g, "");
  const requested = m[2].toLowerCase();
  const allowed = kind === "Users" ? ["id", "username", "externalid", "emails[typeeq\"work\"].value"] : ["id", "displayname", "externalid"];
  if (!allowed.includes(field)) throw new ScimError(400, "Unsupported SCIM filter attribute.", "invalidFilter");
  return records.filter(r => {
    const value = field === "id" ? r.id
      : field === "externalid" ? r.externalId
      : field === "username" && "userName" in r ? r.userName
      : field === "displayname" && "displayName" in r ? r.displayName
      : field.startsWith("emails") && "userName" in r ? r.emails?.find(e => e.type?.toLowerCase() === "work")?.value
      : undefined;
    return value?.toLowerCase() === requested;
  });
}
function pagination(startIndex: number, count: number) {
  if (!Number.isSafeInteger(startIndex) || startIndex < 1 || !Number.isSafeInteger(count) || count < 0) {
    throw new ScimError(400, "Invalid pagination parameters.", "invalidValue");
  }
  return { startIndex, count: Math.min(count, maxPage) };
}

export class ScimService {
  constructor(private store: ScimStore, private org: string, private base: string) {
    if (!safeOrg.test(org) || !base.startsWith("https://")) throw new ScimError(503, "SCIM service configuration invalid.");
  }
  private collection(kind: ResourceKind) { return kind === "Users" ? "scimUsers" : "scimGroups"; }
  private async loadForWrite(kind: ResourceKind, id: string): Promise<{ record: ScimResource; etag: string | null } | null> {
    const collection = this.collection(kind);
    const recordKey = key(this.org, id);
    if (this.store.getWithEtag && this.store.putIfMatch) {
      const current = await this.store.getWithEtag<ScimResource>(collection, recordKey);
      if (!current || current.value.organizationId !== this.org) return null;
      return { record: current.value, etag: current.etag };
    }
    const record = await this.store.get<ScimResource>(collection, recordKey);
    return record?.organizationId === this.org ? { record, etag: null } : null;
  }
  private async saveExisting(kind: ResourceKind, id: string, resource: ScimResource, etag: string | null) {
    try {
      if (etag !== null && this.store.putIfMatch) {
        await this.store.putIfMatch(this.collection(kind), key(this.org, id), resource, etag);
      } else {
        await this.store.put(this.collection(kind), key(this.org, id), resource);
      }
    } catch (error) {
      if (error instanceof Error && /conflict|precondition/i.test(error.message)) {
        throw new ScimError(409, "Concurrent SCIM resource modification; retry using the latest state.");
      }
      throw error;
    }
  }
  async get(kind: ResourceKind, id: string, excludeMembers = false) {
    const record = await this.store.get<ScimResource>(this.collection(kind), key(this.org, id));
    if (!record || record.organizationId !== this.org) throw new ScimError(404, "Resource not found.");
    return scimResponse(record, this.base, excludeMembers);
  }
  private async records(kind: ResourceKind): Promise<ScimResource[]> {
    // Cosmos queries are scoped to a single organization partition. For very large
    // tenants this should be replaced with an indexed, tenant-scoped lookup.
    const values = await this.store.list<ScimResource>(this.collection(kind), this.org + ":");
    return values.filter(v => v.organizationId === this.org);
  }
  async list(kind: ResourceKind, filter: string | null, startIndex: number, count: number, excludeMembers = false) {
    const page = pagination(startIndex, count);
    const matching = filterRecords(await this.records(kind), kind, filter).sort((a, b) => a.id.localeCompare(b.id));
    return { schemas: [LIST_SCHEMA], totalResults: matching.length, startIndex: page.startIndex,
      itemsPerPage: Math.min(page.count, Math.max(0, matching.length - page.startIndex + 1)),
      Resources: matching.slice(page.startIndex - 1, page.startIndex - 1 + page.count)
        .map(r => scimResponse(r, this.base, excludeMembers)) };
  }
  private async assertMembers(members: ScimGroup["members"]) {
    for (const member of members) {
      const user = await this.store.get<ScimUser>("scimUsers", key(this.org, member.value));
      if (!user || user.organizationId !== this.org) throw new ScimError(400, "Group member does not belong to this tenant.", "invalidValue");
    }
  }
  private async assertUnique(kind: ResourceKind, candidate: ScimResource) {
    const records = await this.records(kind);
    const duplicate = records.some(r => r.id !== candidate.id && (
      (candidate.externalId && r.externalId?.toLowerCase() === candidate.externalId.toLowerCase()) ||
      ("userName" in r && "userName" in candidate && r.userName.toLowerCase() === candidate.userName.toLowerCase()) ||
      ("displayName" in r && "displayName" in candidate && typeof r.displayName === "string" && typeof candidate.displayName === "string" && r.displayName.toLowerCase() === candidate.displayName.toLowerCase())
    ));
    if (duplicate) throw new ScimError(409, "SCIM resource already exists.", "uniqueness");
  }
  async create(kind: ResourceKind, body: unknown) {
    const record = kind === "Users" ? userInput(body, this.org) : groupInput(body, this.org);
    await this.assertUnique(kind, record);
    if ("members" in record) await this.assertMembers(record.members);
    try { await this.store.put(this.collection(kind), key(this.org, record.id), record, { ifAbsent: true }); }
    catch (error) {
      if (error instanceof Error && /conflict/i.test(error.message)) throw new ScimError(409, "SCIM resource already exists.", "uniqueness");
      throw error;
    }
    return scimResponse(record, this.base);
  }
  async replace(kind: ResourceKind, id: string, body: unknown) {
    const stored = await this.loadForWrite(kind, id);
    if (!stored) throw new ScimError(404, "Resource not found.");
    const existing = stored.record;
    const next = kind === "Users" ? userInput(body, this.org, existing as ScimUser) : groupInput(body, this.org, existing as ScimGroup);
    await this.assertUnique(kind, next);
    if ("members" in next) await this.assertMembers(next.members);
    await this.saveExisting(kind, id, next, stored.etag);
    return scimResponse(next, this.base);
  }
  async patch(kind: ResourceKind, id: string, body: unknown) {
    const stored = await this.loadForWrite(kind, id);
    if (!stored) throw new ScimError(404, "Resource not found.");
    const existing = stored.record;
    const patch = object(body);
    if (!Array.isArray(patch.Operations) || patch.Operations.length < 1 || patch.Operations.length > 50) throw new ScimError(400, "Invalid PATCH operations.", "invalidSyntax");
    const draft = structuredClone(existing) as ScimResource;
    for (const raw of patch.Operations) {
      const op = object(raw);
      const action = requiredString(op.op, "op").toLowerCase();
      if (!["add", "replace", "remove"].includes(action)) throw new ScimError(400, "Unsupported PATCH operation.", "invalidSyntax");
      const path = optionalString(op.path, "path", 250);
      if (kind === "Groups") this.patchGroup(draft as ScimGroup, action, path, op.value);
      else this.patchUser(draft as ScimUser, action, path, op.value);
    }
    draft.modifiedAt = timestamp();
    await this.assertUnique(kind, draft);
    if ("members" in draft) await this.assertMembers(draft.members);
    await this.saveExisting(kind, id, draft, stored.etag);
    return scimResponse(draft, this.base);
  }
  private patchUser(user: ScimUser, action: string, path: string | undefined, value: unknown) {
    if (!path) {
      const all = object(value);
      for (const [field, data] of Object.entries(all)) this.patchUser(user, action, field, data);
      return;
    }
    const field = path.toLowerCase().replace(/\s+/g, "");
    if (field === "externalid" || field === "id") throw new ScimError(400, "Identity attributes cannot be patched.", "mutability");
    if (field === "active") {
      if (typeof value !== "boolean" && action !== "remove") throw new ScimError(400, "active must be a boolean.", "invalidValue");
      user.active = action === "remove" ? false : value as boolean;
    } else if (field === "username") {
      if (action === "remove") throw new ScimError(400, "userName is required.", "mutability");
      user.userName = requiredString(value, "userName");
    } else if (field === "displayname") {
      user.displayName = action === "remove" ? undefined : optionalString(value, "displayName");
    } else if (field === "name") {
      user.name = action === "remove" ? undefined : parseName(value);
    } else if (field === "name.givenname" || field === "name.familyname" || field === "name.formatted") {
      const fieldName = field === "name.givenname" ? "givenName" : field === "name.familyname" ? "familyName" : "formatted";
      user.name ??= {};
      if (action === "remove") delete user.name[fieldName];
      else user.name[fieldName] = requiredString(value, path);
    } else if (field === "emails") {
      user.emails = action === "remove" ? [] : parseEmails(value);
    } else if (field === 'emails[typeeq"work"].value') {
      user.emails = (user.emails ?? []).filter(e => e.type?.toLowerCase() !== "work");
      if (action !== "remove") user.emails.push({ value: requiredString(value, path), type: "work", primary: true });
    } else {
      throw new ScimError(400, "Unsupported user PATCH path.", "invalidPath");
    }
  }
  private patchGroup(group: ScimGroup, action: string, path: string | undefined, value: unknown) {
    if (!path) {
      const all = object(value);
      for (const [field, data] of Object.entries(all)) this.patchGroup(group, action, field, data);
      return;
    }
    const normalized = path.toLowerCase().replace(/\s+/g, "");
    if (normalized === "displayname") {
      if (action === "remove") throw new ScimError(400, "displayName is required.", "mutability");
      group.displayName = requiredString(value, "displayName");
    } else if (normalized === "members") {
      const incoming = parseMembers(value);
      if (action === "replace") group.members = incoming;
      else if (action === "add") group.members = parseMembers([...group.members, ...incoming]);
      else group.members = value === undefined ? [] : group.members.filter(m => !incoming.some(v => v.value === m.value));
    } else {
      const m = /^members\[valueeq"([0-9a-f-]+)"\]$/.exec(normalized);
      if (!m || action !== "remove") throw new ScimError(400, "Unsupported group PATCH path.", "invalidPath");
      const memberId = validId(m[1]);
      group.members = group.members.filter(member => member.value !== memberId);
    }
  }
  async remove(kind: ResourceKind, id: string) {
    const stored = await this.loadForWrite(kind, id);
    if (!stored) return; // idempotent deletion
    if (kind === "Users") {
      const next = { ...(stored.record as ScimUser), active: false, modifiedAt: timestamp() };
      await this.saveExisting(kind, id, next, stored.etag);
    } else {
      await this.store.delete("scimGroups", key(this.org, id));
    }
  }
}

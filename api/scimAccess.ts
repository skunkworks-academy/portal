import type { ScimStore, ScimUser } from "./scimDomain.js";
import { HttpError } from "./http.js";

/** Optional staged enforcement. SCIM externalId MUST map to Entra objectId (oid).
 * This never grants a Portal role, course entitlement or license. */
export async function requireActiveScimUser(store: ScimStore, organizationId: string, subject: string) {
  if (process.env.SCIM_ENFORCE_PROVISIONED_USERS !== "true") return;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(subject)) {
    throw new HttpError(403, "Active organization provisioning required.");
  }
  const records = await store.list<ScimUser>("scimUsers", organizationId + ":");
  if (!records.some(user => user.organizationId === organizationId && user.active
    && user.externalId?.toLowerCase() === subject.toLowerCase())) {
    throw new HttpError(403, "Active organization provisioning required.");
  }
}

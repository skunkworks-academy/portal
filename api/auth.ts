import type { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";
import type { PortalRole } from "../src/types.js";

// Each tenant must issue and sign its own access tokens. We never trust an
// unverified tenant claim for authorisation: it only chooses Microsoft's HTTPS
// key-discovery endpoint; jwtVerify then verifies signature, audience and issuer.
const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const signingKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const maximumCachedTenants = 32;

function keysForTenant(tenantId: string) {
  const cached = signingKeys.get(tenantId);
  if (cached) return cached;
  const keys = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
  );
  if (signingKeys.size >= maximumCachedTenants) {
    signingKeys.delete(signingKeys.keys().next().value!);
  }
  signingKeys.set(tenantId, keys);
  return keys;
}

// The tenant GUID, v2 issuer, audience and delegated API scope are independent
// checks. A personal Microsoft account has Microsoft's consumer tenant GUID.
export function validatePortalTokenClaims(payload: JWTPayload) {
  const tenantId = typeof payload.tid === "string" ? payload.tid.toLowerCase() : "";
  if (!tenantIdPattern.test(tenantId)) throw new HttpError(401, "Invalid Microsoft tenant.");
  if (payload.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0`) {
    throw new HttpError(401, "Unsupported token issuer.");
  }
  if (payload.ver !== "2.0") throw new HttpError(401, "Microsoft v2 access token required.");
  const scopes = typeof payload.scp === "string" ? payload.scp.split(/\\s+/) : [];
  if (!scopes.includes("access_as_user")) {
    throw new HttpError(403, "A delegated Portal API access_as_user scope is required.");
  }
  const objectId = typeof payload.oid === "string" && payload.oid
    ? payload.oid
    : typeof payload.sub === "string" ? payload.sub : "";
  if (!objectId) throw new HttpError(401, "Microsoft user identity is missing.");
  return {
    tenantId,
    // Preserve existing home-tenant SharePoint IDs; external identities are
    // namespaced so two tenants can never access each other's profile records.
    subject: tenantId === config.entraTenantId.toLowerCase()
      ? objectId
      : `${tenantId}:${objectId}`
  };
}

export interface Principal {
  subject: string;
  name: string;
  email: string;
  tenantId?: string;
  roles: string[];
}

export async function requireUser(request: HttpRequest): Promise<Principal> {
  requireSettings(["apiClientId"]);
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) throw new HttpError(401, "Missing bearer token.");

  let payload: JWTPayload;
  try {
    // Decode only to obtain a strictly validated GUID for key discovery. A
    // forged tenant value never passes the subsequent JWT signature checks.
    const unverified = decodeJwt(token);
    const tenantId = typeof unverified.tid === "string" ? unverified.tid.toLowerCase() : "";
    if (!tenantIdPattern.test(tenantId)) throw new Error("Invalid tenant ID");
    ({ payload } = await jwtVerify(token, keysForTenant(tenantId), {
      audience: [config.apiClientId, `api://${config.apiClientId}`],
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      algorithms: ["RS256"]
    }));
  } catch {
    throw new HttpError(401, "Invalid Microsoft access token.");
  }

  const identity = validatePortalTokenClaims(payload);
  const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
  return {
    subject: identity.subject,
    name: String(payload.name ?? ""),
    email: String(payload.preferred_username ?? payload.email ?? ""),
    tenantId: identity.tenantId,
    // External tenants cannot assign themselves trusted Academy app roles.
    roles: identity.tenantId === config.entraTenantId.toLowerCase() ? roles : []
  };
}

function normalizeRole(role: string) {
  return role.toLowerCase();
}

export function hasPortalRole(principal: Pick<Principal, "tenantId" | "roles">, roles: string[]) {
  if (principal.tenantId !== config.entraTenantId) return false;
  const assignedRoles = new Set(principal.roles.map(normalizeRole));
  return roles.some((role) => assignedRoles.has(normalizeRole(role)));
}

export function portalRoleFromPrincipal(principal: Pick<Principal, "tenantId" | "roles">): PortalRole {
  if (hasPortalRole(principal, ["Portal.Admin", "Portal.Staff"])) return "Staff";
  if (hasPortalRole(principal, ["Portal.Instructor"])) return "Instructor";
  return "Student";
}

export async function requireStudent(request: HttpRequest): Promise<Principal> {
  // Verified users register as learners by default, without pre-assigned roles.
  return requireUser(request);
}

export async function requireInstructor(request: HttpRequest): Promise<Principal> {
  const principal = await requireUser(request);
  if (!hasPortalRole(principal, ["Portal.Instructor", "Portal.Staff", "Portal.Admin"])) {
    throw new HttpError(403, "Portal.Instructor access in the Skunkworks tenant is required.");
  }
  return principal;
}

export async function requireAdmin(request: HttpRequest): Promise<Principal> {
  const principal = await requireUser(request);
  if (!hasPortalRole(principal, ["Portal.Admin", "Portal.Staff"])) {
    throw new HttpError(403, "Portal.Admin or Portal.Staff access in the Skunkworks tenant is required.");
  }
  return principal;
}

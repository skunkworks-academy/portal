import type { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";
import type { PortalRole } from "../src/types.js";

const jwks = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));

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
  if (!token) {
    throw new HttpError(401, "Missing bearer token.");
  }

  const { payload } = await jwtVerify(token, jwks, {
    audience: [config.apiClientId, `api://${config.apiClientId}`]
  });

  const issuer = String(payload.iss ?? "");
  if (!/^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0\/?$/.test(issuer)) {
    throw new HttpError(401, "Unsupported token issuer.");
  }

  const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
  return {
    subject: String(payload.oid ?? payload.sub ?? ""),
    name: String(payload.name ?? ""),
    email: String(payload.preferred_username ?? payload.email ?? ""),
    tenantId: typeof payload.tid === "string" ? payload.tid : undefined,
    roles
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
  const principal = await requireUser(request);
  if (!hasPortalRole(principal, ["Portal.Student", "Portal.Staff", "Portal.Admin"])) {
    throw new HttpError(403, "Portal.Student access in the Skunkworks tenant is required.");
  }
  return principal;
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

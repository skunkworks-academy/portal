import type { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";

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

export async function requireAdmin(request: HttpRequest): Promise<Principal> {
  const principal = await requireUser(request);
  if (principal.tenantId !== config.entraTenantId || !principal.roles.includes("Portal.Admin")) {
    throw new HttpError(403, "Portal.Admin access in the Skunkworks tenant is required.");
  }
  return principal;
}

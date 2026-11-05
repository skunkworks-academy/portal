import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ScimError } from "./scimDomain.js";

type SecretHash = { salt: string; hash: string; expiresAt: string };
type ProvisioningClient = {
  clientId: string; organizationId: string; entraTenantId: string;
  enabled: boolean; secretHashes: SecretHash[];
};
export type ScimPrincipal = { organizationId: string; entraTenantId: string; clientId: string };
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[A-Za-z0-9_-]{1,100}$/;
const hex = /^[0-9a-f]+$/i;
const audience = "skunkworks-academy-scim";
const scope = "scim.provision";
const ttlSeconds = 300;

function settings() {
  if (process.env.SCIM_ENABLED !== "true") throw new ScimError(503, "SCIM provisioning is not enabled.");
  const base = process.env.SCIM_PUBLIC_BASE_URL;
  const secret = process.env.SCIM_TOKEN_SIGNING_KEY;
  if (!base || !/^https:\/\/[a-z0-9.-]+\/api\/scim\/v2$/i.test(base) || !secret) {
    throw new ScimError(503, "SCIM provisioning is not configured.");
  }
  const key = Buffer.from(secret, "base64url");
  if (key.length < 32) throw new ScimError(503, "SCIM signing key configuration invalid.");
  return { base: base.replace(/\/$/, ""), key: new Uint8Array(key) };
}
function clients(): ProvisioningClient[] {
  let parsed: unknown;
  try { parsed = JSON.parse(process.env.SCIM_CLIENTS_JSON ?? ""); }
  catch { throw new ScimError(503, "SCIM client registry is not configured."); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 500) {
    throw new ScimError(503, "SCIM client registry is invalid.");
  }
  const known = new Set<string>();
  for (const c of parsed as ProvisioningClient[]) {
    if (!c || typeof c.clientId !== "string" || !slug.test(c.clientId) || !slug.test(c.organizationId)
      || !guid.test(c.entraTenantId) || typeof c.enabled !== "boolean"
      || !Array.isArray(c.secretHashes) || c.secretHashes.length < 1 || c.secretHashes.length > 3
      || known.has(c.clientId)) throw new ScimError(503, "SCIM client registry invalid: tenant/client configuration.");
    known.add(c.clientId);
    for (const s of c.secretHashes) {
      if (!s || typeof s.salt !== "string" || s.salt.length !== 32 || !hex.test(s.salt)
        || typeof s.hash !== "string" || s.hash.length !== 128 || !hex.test(s.hash)
        || typeof s.expiresAt !== "string" || !Number.isFinite(Date.parse(s.expiresAt))) {
        throw new ScimError(503, "SCIM client registry invalid: secret hash or expiry metadata.");
      }
    }
  }
  return parsed as ProvisioningClient[];
}
function liveSecret(hash: SecretHash, secret: string): boolean {
  if (Date.parse(hash.expiresAt) <= Date.now()) return false;
  const expected = Buffer.from(hash.hash, "hex");
  const candidate = scryptSync(secret, Buffer.from(hash.salt, "hex"), 64);
  return timingSafeEqual(candidate, expected);
}
export function scimConfig() {
  const { base } = settings();
  return { base };
}
/** OAuth 2.0 client credentials: credentials only at token endpoint, never at SCIM resources. */
export async function issueScimToken(clientId: string, clientSecret: string) {
  const { base, key } = settings();
  const all = clients();
  const c = all.find(item => item.clientId === clientId && item.enabled);
  if (!c || clientSecret.length < 24 || clientSecret.length > 512
    || !c.secretHashes.some(hash => liveSecret(hash, clientSecret))) {
    throw new ScimError(401, "Invalid client credentials.");
  }
  const token = await new SignJWT({ scp: scope, org: c.organizationId, tid: c.entraTenantId.toLowerCase() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(base).setAudience(audience).setSubject(c.clientId)
    .setIssuedAt().setExpirationTime(ttlSeconds + "s").setJti(randomUUID()).sign(key);
  return { access_token: token, token_type: "Bearer", expires_in: ttlSeconds, scope };
}
export async function verifyScimToken(authorization: string | null): Promise<ScimPrincipal> {
  const { base, key } = settings();
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization ?? "");
  if (!match) throw new ScimError(401, "SCIM bearer token required.");
  try {
    const { payload } = await jwtVerify(match[1], key, {
      audience, issuer: base, algorithms: ["HS256"], clockTolerance: "5 seconds"
    });
    if (payload.scp !== scope || typeof payload.sub !== "string"
      || typeof payload.org !== "string" || typeof payload.tid !== "string") throw Error("Scope denied.");
    const c = clients().find(item => item.clientId === payload.sub && item.enabled);
    if (!c || c.organizationId !== payload.org || c.entraTenantId.toLowerCase() !== payload.tid) {
      throw Error("Tenant binding mismatch.");
    }
    return { organizationId: c.organizationId, entraTenantId: c.entraTenantId.toLowerCase(), clientId: c.clientId };
  } catch {
    throw new ScimError(401, "Invalid or expired SCIM access token.");
  }
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { HttpError } from "./http.js";

const canonicalTenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5";
const storageScope = "https://storage.azure.com/.default";
const tableApiVersion = "2019-02-02";
const tokenBundleAad = Buffer.from("swa-identity-bff-token-bundle-v1", "utf8");

export interface IdentityBffConfig {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  publicOrigin: string;
  redirectUri: string;
  propertyId: string;
  storageAccountName: string;
  tablePrefix: string;
  managedIdentityClientId?: string;
  encryptionKey: string;
  apiScope?: string;
  transactionTtlMinutes: number;
  sessionTtlMinutes: number;
}

export interface AuthTransaction {
  propertyId: string;
  stateHash: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  publicOrigin: string;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
  correlationId: string;
}

export interface TokenBundle {
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: string;
}

export interface VerifiedOidcIdentity {
  issuer: string;
  tenantId: string;
  objectId: string;
  providerSubject?: string;
  displayName: string;
  email: string;
  roles: string[];
  tokenBundle?: TokenBundle;
}

export interface SessionRecord {
  propertyId: string;
  sessionHash: string;
  subjectId: string;
  issuer: string;
  tenantId: string;
  objectId: string;
  displayName: string;
  email: string;
  roles: string[];
  createdAt: string;
  expiresAt: string;
  csrfToken: string;
  correlationId: string;
  encryptedTokenBundle?: string;
}

export interface SessionView {
  authenticated: true;
  subject: string;
  displayName: string;
  email: string;
  roles: string[];
  sessionExpiresAt: string;
  csrfToken: string;
}

export interface IdentityStore {
  putTransaction(transaction: AuthTransaction): Promise<void>;
  consumeTransaction(propertyId: string, stateHash: string, now: Date): Promise<AuthTransaction | null>;
  putSession(session: SessionRecord): Promise<void>;
  getSession(propertyId: string, sessionHash: string): Promise<SessionRecord | null>;
  deleteSession(propertyId: string, sessionHash: string): Promise<void>;
  resolveSubject(identity: VerifiedOidcIdentity): Promise<string>;
}

export interface OidcClient {
  authorizationUrl(transaction: AuthTransaction, state: string): string;
  exchangeCode(code: string, transaction: AuthTransaction): Promise<VerifiedOidcIdentity>;
}

interface TableReadResult {
  entity: Record<string, unknown>;
  etag: string;
}

class TableRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function configuredValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function propertyIdentifier(value: string | undefined) {
  const propertyId = configuredValue(value) ?? "portal";
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(propertyId)) {
    throw new Error("IDENTITY_BFF_PROPERTY_ID must contain only lowercase letters, digits and hyphens.");
  }
  return propertyId;
}

function tablePrefix(value: string | undefined) {
  const prefix = configuredValue(value) ?? "SwaIdentity";
  if (!/^[A-Za-z][A-Za-z0-9]{2,30}$/.test(prefix)) {
    throw new Error("IDENTITY_BFF_TABLE_PREFIX must be 3-31 alphanumeric characters and start with a letter.");
  }
  return prefix;
}

export function loadIdentityBffConfig(env: NodeJS.ProcessEnv = process.env): IdentityBffConfig {
  return {
    enabled: env.IDENTITY_BFF_ENABLED === "true",
    tenantId: configuredValue(env.IDENTITY_BFF_TENANT_ID) ?? canonicalTenantId,
    clientId: configuredValue(env.IDENTITY_BFF_CLIENT_ID) ?? "",
    clientSecret: configuredValue(env.IDENTITY_BFF_CLIENT_SECRET) ?? "",
    publicOrigin: (configuredValue(env.IDENTITY_BFF_PUBLIC_ORIGIN) ?? "https://portal.skunkworksacademy.com").replace(/\/$/, ""),
    redirectUri: configuredValue(env.IDENTITY_BFF_REDIRECT_URI) ?? "",
    propertyId: propertyIdentifier(env.IDENTITY_BFF_PROPERTY_ID),
    storageAccountName: configuredValue(env.IDENTITY_BFF_STORAGE_ACCOUNT) ?? "",
    tablePrefix: tablePrefix(env.IDENTITY_BFF_TABLE_PREFIX),
    managedIdentityClientId: configuredValue(env.IDENTITY_BFF_MANAGED_IDENTITY_CLIENT_ID),
    encryptionKey: configuredValue(env.IDENTITY_BFF_ENCRYPTION_KEY) ?? "",
    apiScope: configuredValue(env.IDENTITY_BFF_API_SCOPE),
    transactionTtlMinutes: Math.min(positiveInteger(env.IDENTITY_BFF_TRANSACTION_TTL_MINUTES, 5), 10),
    sessionTtlMinutes: Math.min(positiveInteger(env.IDENTITY_BFF_SESSION_TTL_MINUTES, 480), 1440)
  };
}

export function missingIdentityBffSettings(config: IdentityBffConfig) {
  if (!config.enabled) return [];
  const missing: string[] = [];
  if (!config.clientId) missing.push("IDENTITY_BFF_CLIENT_ID");
  if (!config.clientSecret) missing.push("IDENTITY_BFF_CLIENT_SECRET");
  if (!config.redirectUri) missing.push("IDENTITY_BFF_REDIRECT_URI");
  if (!config.storageAccountName) missing.push("IDENTITY_BFF_STORAGE_ACCOUNT");
  if (!config.encryptionKey) missing.push("IDENTITY_BFF_ENCRYPTION_KEY");
  return missing;
}

export function assertIdentityBffReady(config: IdentityBffConfig) {
  if (!config.enabled) throw new HttpError(404, "Not found.");
  const missing = missingIdentityBffSettings(config);
  if (missing.length) throw new HttpError(503, "Identity session service is not configured.");

  const publicOrigin = new URL(config.publicOrigin);
  const redirectUri = new URL(config.redirectUri);
  if (publicOrigin.protocol !== "https:" && publicOrigin.hostname !== "localhost") {
    throw new HttpError(503, "Identity session service requires an HTTPS public origin.");
  }
  if (redirectUri.origin !== publicOrigin.origin) {
    throw new HttpError(503, "Identity callback must be same-origin with the configured public application origin.");
  }
  decodeEncryptionKey(config.encryptionKey);
}

export function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function createPkce() {
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = sha256(codeVerifier);
  return { codeVerifier, codeChallenge, method: "S256" as const };
}

export function normalizeReturnTo(value: string | null | undefined, publicOrigin: string) {
  if (!value) return "/";
  try {
    if (value.startsWith("/")) {
      const parsed = new URL(value, publicOrigin);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    const parsed = new URL(value);
    if (parsed.origin !== new URL(publicOrigin).origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function mapAcademyRoles(roles: string[]) {
  const normalized = new Set(roles.map((role) => role.toLowerCase()));
  const academyRoles: string[] = [];
  if (normalized.has("portal.admin")) academyRoles.push("administrator", "staff");
  else if (normalized.has("portal.staff")) academyRoles.push("staff");
  if (normalized.has("portal.instructor")) academyRoles.push("instructor");
  if (normalized.has("portal.student")) academyRoles.push("learner");
  return [...new Set(academyRoles)];
}

function decodeEncryptionKey(value: string) {
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new HttpError(503, "Identity encryption key is invalid.");
  }
  if (key.length !== 32) throw new HttpError(503, "Identity encryption key must decode to exactly 32 bytes.");
  return key;
}

export function encryptTokenBundle(bundle: TokenBundle, encodedKey: string) {
  const key = decodeEncryptionKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(tokenBundleAad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptTokenBundle(value: string, encodedKey: string): TokenBundle {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Unsupported token bundle format.");
  const key = decodeEncryptionKey(encodedKey);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAAD(tokenBundleAad);
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as TokenBundle;
}

function constantTimeTextEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

function entityString(entity: Record<string, unknown>, key: string) {
  const value = entity[key];
  return value == null ? "" : String(value);
}

function parseRoles(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function escapeODataKey(value: string) {
  return value.replaceAll("'", "''");
}

export class AzureTableIdentityStore implements IdentityStore {
  private readonly credential: DefaultAzureCredential;
  private readonly root: string;
  private readonly authTable: string;
  private readonly sessionTable: string;
  private readonly identityTable: string;
  private initializePromise?: Promise<void>;

  constructor(private readonly config: IdentityBffConfig) {
    this.credential = new DefaultAzureCredential(
      config.managedIdentityClientId ? { managedIdentityClientId: config.managedIdentityClientId } : undefined
    );
    this.root = `https://${config.storageAccountName}.table.core.windows.net`;
    this.authTable = `${config.tablePrefix}AuthTxn`;
    this.sessionTable = `${config.tablePrefix}Sessions`;
    this.identityTable = `${config.tablePrefix}IdentityLinks`;
  }

  private async request(path: string, init: RequestInit = {}) {
    const token = await this.credential.getToken(storageScope);
    if (!token) throw new TableRequestError(503, "Unable to acquire Azure Storage identity token.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token.token}`);
    headers.set("x-ms-date", new Date().toUTCString());
    headers.set("x-ms-version", tableApiVersion);
    headers.set("Accept", "application/json;odata=nometadata");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(`${this.root}${path}`, { ...init, headers });
  }

  private async ensureTable(name: string) {
    const response = await this.request("/Tables", {
      method: "POST",
      body: JSON.stringify({ TableName: name })
    });
    if (response.ok || response.status === 409) return;
    throw new TableRequestError(response.status, `Unable to initialize identity table ${name}.`);
  }

  private async ensureInitialized() {
    this.initializePromise ??= Promise.all([
      this.ensureTable(this.authTable),
      this.ensureTable(this.sessionTable),
      this.ensureTable(this.identityTable)
    ]).then(() => undefined);
    return this.initializePromise;
  }

  private entityPath(table: string, partitionKey: string, rowKey: string) {
    return `/${table}(PartitionKey='${escapeODataKey(partitionKey)}',RowKey='${escapeODataKey(rowKey)}')`;
  }

  private async createEntity(table: string, entity: Record<string, unknown>) {
    await this.ensureInitialized();
    const response = await this.request(`/${table}`, {
      method: "POST",
      headers: { Prefer: "return-no-content" },
      body: JSON.stringify(entity)
    });
    if (response.status === 409) return false;
    if (!response.ok) throw new TableRequestError(response.status, `Unable to create identity record in ${table}.`);
    return true;
  }

  private async readEntity(table: string, partitionKey: string, rowKey: string): Promise<TableReadResult | null> {
    await this.ensureInitialized();
    const response = await this.request(this.entityPath(table, partitionKey, rowKey));
    if (response.status === 404) return null;
    if (!response.ok) throw new TableRequestError(response.status, `Unable to read identity record from ${table}.`);
    const etag = response.headers.get("etag") ?? "";
    if (!etag) throw new TableRequestError(502, `Identity record from ${table} did not include an ETag.`);
    return { entity: await response.json() as Record<string, unknown>, etag };
  }

  private async conditionalDelete(table: string, partitionKey: string, rowKey: string, etag: string) {
    const response = await this.request(this.entityPath(table, partitionKey, rowKey), {
      method: "DELETE",
      headers: { "If-Match": etag }
    });
    if (response.status === 404 || response.status === 412) return false;
    if (!response.ok) throw new TableRequestError(response.status, `Unable to delete identity record from ${table}.`);
    return true;
  }

  async putTransaction(transaction: AuthTransaction) {
    const created = await this.createEntity(this.authTable, {
      PartitionKey: transaction.propertyId,
      RowKey: transaction.stateHash,
      nonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier,
      codeChallenge: transaction.codeChallenge,
      redirectUri: transaction.redirectUri,
      publicOrigin: transaction.publicOrigin,
      returnTo: transaction.returnTo,
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt,
      correlationId: transaction.correlationId
    });
    if (!created) throw new HttpError(409, "Unable to create a unique authorization transaction.");
  }

  async consumeTransaction(propertyId: string, stateHash: string, now: Date) {
    const record = await this.readEntity(this.authTable, propertyId, stateHash);
    if (!record) return null;
    const entity = record.entity;
    const transaction: AuthTransaction = {
      propertyId,
      stateHash,
      nonce: entityString(entity, "nonce"),
      codeVerifier: entityString(entity, "codeVerifier"),
      codeChallenge: entityString(entity, "codeChallenge"),
      redirectUri: entityString(entity, "redirectUri"),
      publicOrigin: entityString(entity, "publicOrigin"),
      returnTo: entityString(entity, "returnTo"),
      createdAt: entityString(entity, "createdAt"),
      expiresAt: entityString(entity, "expiresAt"),
      correlationId: entityString(entity, "correlationId")
    };
    if (!transaction.expiresAt || Date.parse(transaction.expiresAt) <= now.getTime()) {
      await this.conditionalDelete(this.authTable, propertyId, stateHash, record.etag);
      return null;
    }
    const consumed = await this.conditionalDelete(this.authTable, propertyId, stateHash, record.etag);
    return consumed ? transaction : null;
  }

  async putSession(session: SessionRecord) {
    const created = await this.createEntity(this.sessionTable, {
      PartitionKey: session.propertyId,
      RowKey: session.sessionHash,
      subjectId: session.subjectId,
      issuer: session.issuer,
      tenantId: session.tenantId,
      objectId: session.objectId,
      displayName: session.displayName,
      email: session.email,
      rolesJson: JSON.stringify(session.roles),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
      correlationId: session.correlationId,
      encryptedTokenBundle: session.encryptedTokenBundle ?? ""
    });
    if (!created) throw new HttpError(409, "Unable to create a unique application session.");
  }

  async getSession(propertyId: string, sessionHash: string) {
    const record = await this.readEntity(this.sessionTable, propertyId, sessionHash);
    if (!record) return null;
    const entity = record.entity;
    return {
      propertyId,
      sessionHash,
      subjectId: entityString(entity, "subjectId"),
      issuer: entityString(entity, "issuer"),
      tenantId: entityString(entity, "tenantId"),
      objectId: entityString(entity, "objectId"),
      displayName: entityString(entity, "displayName"),
      email: entityString(entity, "email"),
      roles: parseRoles(entityString(entity, "rolesJson")),
      createdAt: entityString(entity, "createdAt"),
      expiresAt: entityString(entity, "expiresAt"),
      csrfToken: entityString(entity, "csrfToken"),
      correlationId: entityString(entity, "correlationId"),
      encryptedTokenBundle: entityString(entity, "encryptedTokenBundle") || undefined
    } satisfies SessionRecord;
  }

  async deleteSession(propertyId: string, sessionHash: string) {
    const record = await this.readEntity(this.sessionTable, propertyId, sessionHash);
    if (!record) return;
    await this.conditionalDelete(this.sessionTable, propertyId, sessionHash, record.etag);
  }

  async resolveSubject(identity: VerifiedOidcIdentity) {
    const providerKeyHash = sha256(`${identity.issuer}|${identity.tenantId}|${identity.objectId}`);
    const existing = await this.readEntity(this.identityTable, "entra", providerKeyHash);
    if (existing) return entityString(existing.entity, "subjectId");

    const subjectId = randomUUID();
    const created = await this.createEntity(this.identityTable, {
      PartitionKey: "entra",
      RowKey: providerKeyHash,
      subjectId,
      issuer: identity.issuer,
      tenantId: identity.tenantId,
      objectId: identity.objectId,
      providerSubject: identity.providerSubject ?? "",
      createdAt: new Date().toISOString()
    });
    if (created) return subjectId;

    const winner = await this.readEntity(this.identityTable, "entra", providerKeyHash);
    const winnerSubject = winner ? entityString(winner.entity, "subjectId") : "";
    if (!winnerSubject) throw new HttpError(503, "Unable to resolve Academy subject identity.");
    return winnerSubject;
  }
}

export class EntraOidcClient implements OidcClient {
  private readonly issuer: string;
  private readonly authorizeEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: IdentityBffConfig) {
    this.issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
    this.authorizeEndpoint = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`;
    this.tokenEndpoint = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    this.jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`));
  }

  private scopes() {
    return ["openid", "profile", "email", "offline_access", ...(this.config.apiScope ? [this.config.apiScope] : [])];
  }

  authorizationUrl(transaction: AuthTransaction, state: string) {
    const url = new URL(this.authorizeEndpoint);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      response_mode: "query",
      redirect_uri: transaction.redirectUri,
      scope: this.scopes().join(" "),
      state,
      nonce: transaction.nonce,
      code_challenge: transaction.codeChallenge,
      code_challenge_method: "S256"
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string, transaction: AuthTransaction) {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.codeVerifier,
      scope: this.scopes().join(" ")
    });
    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new HttpError(401, "Microsoft Entra authorization code exchange failed.");
    const tokens = await response.json() as {
      id_token?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!tokens.id_token) throw new HttpError(401, "Microsoft Entra did not return an identity token.");

    const { payload } = await jwtVerify(tokens.id_token, this.jwks, {
      issuer: this.issuer,
      audience: this.config.clientId
    });
    if (payload.nonce !== transaction.nonce) throw new HttpError(401, "Microsoft Entra nonce validation failed.");
    const tenantId = typeof payload.tid === "string" ? payload.tid : "";
    const objectId = typeof payload.oid === "string" ? payload.oid : "";
    if (tenantId !== canonicalTenantId || tenantId !== this.config.tenantId) {
      throw new HttpError(403, "This identity is not issued by the approved Skunkworks Academy tenant.");
    }
    if (!objectId) throw new HttpError(403, "The Microsoft Entra identity does not contain the required object identifier.");

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + Math.max(0, tokens.expires_in) * 1000).toISOString()
      : undefined;
    const tokenBundle = tokens.access_token || tokens.refresh_token
      ? {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          scope: tokens.scope,
          expiresAt
        }
      : undefined;

    return {
      issuer: this.issuer,
      tenantId,
      objectId,
      providerSubject: typeof payload.sub === "string" ? payload.sub : undefined,
      displayName: typeof payload.name === "string" ? payload.name : "",
      email: typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : typeof payload.email === "string" ? payload.email : "",
      roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
      tokenBundle
    } satisfies VerifiedOidcIdentity;
  }
}

export class IdentityBffService {
  constructor(
    private readonly config: IdentityBffConfig,
    private readonly store: IdentityStore,
    private readonly oidc: OidcClient,
    private readonly now: () => Date = () => new Date()
  ) {}

  async startLogin(returnToInput?: string | null) {
    const now = this.now();
    const state = base64Url(randomBytes(32));
    const nonce = base64Url(randomBytes(32));
    const { codeVerifier, codeChallenge } = createPkce();
    const transaction: AuthTransaction = {
      propertyId: this.config.propertyId,
      stateHash: sha256(state),
      nonce,
      codeVerifier,
      codeChallenge,
      redirectUri: this.config.redirectUri,
      publicOrigin: this.config.publicOrigin,
      returnTo: normalizeReturnTo(returnToInput, this.config.publicOrigin),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.transactionTtlMinutes * 60_000).toISOString(),
      correlationId: randomUUID()
    };
    await this.store.putTransaction(transaction);
    return {
      location: this.oidc.authorizationUrl(transaction, state),
      correlationId: transaction.correlationId
    };
  }

  async completeCallback(input: { state?: string | null; code?: string | null; error?: string | null }) {
    const state = input.state?.trim();
    if (!state) throw new HttpError(400, "Authorization callback is missing state.");
    const transaction = await this.store.consumeTransaction(this.config.propertyId, sha256(state), this.now());
    if (!transaction) throw new HttpError(400, "Authorization transaction is invalid, expired or already consumed.");
    if (transaction.publicOrigin !== this.config.publicOrigin || transaction.redirectUri !== this.config.redirectUri) {
      throw new HttpError(400, "Authorization transaction does not match this application boundary.");
    }
    if (input.error) throw new HttpError(401, "Microsoft Entra did not complete authentication.");
    const code = input.code?.trim();
    if (!code) throw new HttpError(400, "Authorization callback is missing a code.");

    const identity = await this.oidc.exchangeCode(code, transaction);
    if (identity.tenantId !== canonicalTenantId || identity.tenantId !== this.config.tenantId) {
      throw new HttpError(403, "Identity tenant is not permitted for this rollout.");
    }
    const subjectId = await this.store.resolveSubject(identity);
    const now = this.now();
    const sessionId = base64Url(randomBytes(32));
    const csrfToken = base64Url(randomBytes(32));
    const session: SessionRecord = {
      propertyId: this.config.propertyId,
      sessionHash: sha256(sessionId),
      subjectId,
      issuer: identity.issuer,
      tenantId: identity.tenantId,
      objectId: identity.objectId,
      displayName: identity.displayName,
      email: identity.email,
      roles: mapAcademyRoles(identity.roles),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.sessionTtlMinutes * 60_000).toISOString(),
      csrfToken,
      correlationId: transaction.correlationId,
      encryptedTokenBundle: identity.tokenBundle
        ? encryptTokenBundle(identity.tokenBundle, this.config.encryptionKey)
        : undefined
    };
    await this.store.putSession(session);
    return { sessionId, session, returnTo: transaction.returnTo };
  }

  async sessionView(sessionId: string | undefined | null): Promise<SessionView | null> {
    if (!sessionId) return null;
    const sessionHash = sha256(sessionId);
    const session = await this.store.getSession(this.config.propertyId, sessionHash);
    if (!session) return null;
    if (!session.expiresAt || Date.parse(session.expiresAt) <= this.now().getTime()) {
      await this.store.deleteSession(this.config.propertyId, sessionHash);
      return null;
    }
    return {
      authenticated: true,
      subject: session.subjectId,
      displayName: session.displayName,
      email: session.email,
      roles: session.roles,
      sessionExpiresAt: session.expiresAt,
      csrfToken: session.csrfToken
    };
  }

  async logout(sessionId: string | undefined | null, csrfToken: string | undefined | null) {
    if (!sessionId) return;
    const sessionHash = sha256(sessionId);
    const session = await this.store.getSession(this.config.propertyId, sessionHash);
    if (!session) return;
    if (!csrfToken || !constantTimeTextEqual(session.csrfToken, csrfToken)) {
      throw new HttpError(403, "CSRF validation failed.");
    }
    await this.store.deleteSession(this.config.propertyId, sessionHash);
  }
}

export function serializeSessionCookie(sessionId: string, maxAgeSeconds: number) {
  return `__Host-swa_session=${sessionId}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie() {
  return "__Host-swa_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
}

export function readSessionCookie(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "__Host-swa_session") return rest.join("=") || undefined;
  }
  return undefined;
}

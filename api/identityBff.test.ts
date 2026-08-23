import { describe, expect, it } from "vitest";
import {
  createPkce,
  decryptTokenBundle,
  encryptTokenBundle,
  EntraOidcClient,
  IdentityBffService,
  mapAcademyRoles,
  normalizeReturnTo,
  serializeSessionCookie,
  sha256,
  type AuthTransaction,
  type IdentityBffConfig,
  type IdentityStore,
  type OidcClient,
  type SessionRecord,
  type VerifiedOidcIdentity
} from "./identityBff.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

function config(): IdentityBffConfig {
  return {
    enabled: true,
    tenantId: "338a8916-80d9-467c-a94a-7f61d04ef7d5",
    clientId: "00000000-0000-0000-0000-000000000001",
    clientSecret: "test-secret",
    publicOrigin: "https://portal.skunkworksacademy.com",
    redirectUri: "https://portal.skunkworksacademy.com/auth/callback",
    propertyId: "portal",
    storageAccountName: "teststorage",
    tablePrefix: "SwaIdentity",
    encryptionKey,
    transactionTtlMinutes: 5,
    sessionTtlMinutes: 480
  };
}

class MemoryStore implements IdentityStore {
  readonly transactions = new Map<string, AuthTransaction>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly subjects = new Map<string, string>();

  private key(propertyId: string, value: string) {
    return `${propertyId}:${value}`;
  }

  async putTransaction(transaction: AuthTransaction) {
    const key = this.key(transaction.propertyId, transaction.stateHash);
    if (this.transactions.has(key)) throw new Error("duplicate transaction");
    this.transactions.set(key, structuredClone(transaction));
  }

  async consumeTransaction(propertyId: string, stateHash: string, now: Date) {
    const key = this.key(propertyId, stateHash);
    const transaction = this.transactions.get(key);
    if (!transaction) return null;
    this.transactions.delete(key);
    if (Date.parse(transaction.expiresAt) <= now.getTime()) return null;
    return structuredClone(transaction);
  }

  async putSession(session: SessionRecord) {
    this.sessions.set(this.key(session.propertyId, session.sessionHash), structuredClone(session));
  }

  async getSession(propertyId: string, sessionHash: string) {
    return structuredClone(this.sessions.get(this.key(propertyId, sessionHash)) ?? null);
  }

  async deleteSession(propertyId: string, sessionHash: string) {
    this.sessions.delete(this.key(propertyId, sessionHash));
  }

  async resolveSubject(identity: VerifiedOidcIdentity) {
    const key = `${identity.issuer}|${identity.tenantId}|${identity.objectId}`;
    const existing = this.subjects.get(key);
    if (existing) return existing;
    const subject = "academy-subject-001";
    this.subjects.set(key, subject);
    return subject;
  }
}

class FakeOidc implements OidcClient {
  exchanges = 0;

  authorizationUrl(transaction: AuthTransaction, state: string) {
    const url = new URL("https://login.example.test/authorize");
    url.search = new URLSearchParams({
      state,
      nonce: transaction.nonce,
      code_challenge: transaction.codeChallenge,
      code_challenge_method: "S256",
      redirect_uri: transaction.redirectUri
    }).toString();
    return url.toString();
  }

  async exchangeCode(_code: string, _transaction: AuthTransaction) {
    this.exchanges += 1;
    return {
      issuer: "https://login.microsoftonline.com/338a8916-80d9-467c-a94a-7f61d04ef7d5/v2.0",
      tenantId: "338a8916-80d9-467c-a94a-7f61d04ef7d5",
      objectId: "11111111-1111-1111-1111-111111111111",
      providerSubject: "provider-subject",
      displayName: "Test Learner",
      email: "learner@example.test",
      roles: ["Portal.Student"],
      tokenBundle: {
        accessToken: "server-only-access-token",
        refreshToken: "server-only-refresh-token",
        scope: "api://example/access_as_user",
        expiresAt: "2026-08-23T19:00:00.000Z"
      }
    } satisfies VerifiedOidcIdentity;
  }
}

describe("Identity BFF security invariants", () => {
  it("always derives an S256 PKCE challenge from the verifier", () => {
    const pkce = createPkce();
    expect(pkce.method).toBe("S256");
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
    expect(pkce.codeChallenge).toBe(sha256(pkce.codeVerifier));
  });

  it("emits code_challenge_method=S256 in the Entra authorization request", () => {
    const oidc = new EntraOidcClient(config());
    const transaction: AuthTransaction = {
      propertyId: "portal",
      stateHash: sha256("state"),
      nonce: "nonce",
      codeVerifier: "verifier",
      codeChallenge: sha256("verifier"),
      redirectUri: "https://portal.skunkworksacademy.com/auth/callback",
      publicOrigin: "https://portal.skunkworksacademy.com",
      returnTo: "/courses",
      createdAt: "2026-08-23T15:00:00.000Z",
      expiresAt: "2026-08-23T15:05:00.000Z",
      correlationId: "test-correlation"
    };
    const url = new URL(oidc.authorizationUrl(transaction, "opaque-state"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(transaction.codeChallenge);
    expect(url.searchParams.get("state")).toBe("opaque-state");
  });

  it("rejects external return targets and retains same-origin paths", () => {
    const origin = "https://portal.skunkworksacademy.com";
    expect(normalizeReturnTo("https://evil.example/phish", origin)).toBe("/");
    expect(normalizeReturnTo("/courses?id=42#lesson", origin)).toBe("/courses?id=42#lesson");
    expect(normalizeReturnTo("https://portal.skunkworksacademy.com/profile", origin)).toBe("/profile");
  });

  it("serializes a host-only secure HttpOnly SameSite cookie without Domain", () => {
    const cookie = serializeSessionCookie("opaque-session", 3600);
    expect(cookie).toContain("__Host-swa_session=opaque-session");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("encrypts server-only token material with authenticated encryption", () => {
    const encrypted = encryptTokenBundle({ accessToken: "access", refreshToken: "refresh" }, encryptionKey);
    expect(encrypted).not.toContain("access");
    expect(encrypted).not.toContain("refresh");
    expect(decryptTokenBundle(encrypted, encryptionKey)).toEqual({ accessToken: "access", refreshToken: "refresh" });
  });

  it("maps only explicit Entra application roles into Academy roles", () => {
    expect(mapAcademyRoles(["Portal.Admin", "Portal.Instructor", "Portal.Student"])).toEqual([
      "administrator",
      "staff",
      "instructor",
      "learner"
    ]);
    expect(mapAcademyRoles([])).toEqual([]);
  });

  it("consumes authorization state once, creates an opaque session, and enforces CSRF on logout", async () => {
    const store = new MemoryStore();
    const oidc = new FakeOidc();
    const now = new Date("2026-08-23T15:00:00.000Z");
    const service = new IdentityBffService(config(), store, oidc, () => now);

    const login = await service.startLogin("/courses");
    const loginUrl = new URL(login.location);
    expect(loginUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = loginUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await service.completeCallback({ state, code: "one-time-code" });
    expect(callback.returnTo).toBe("/courses");
    expect(callback.session.sessionHash).toBe(sha256(callback.sessionId));
    expect(callback.session.subjectId).toBe("academy-subject-001");
    expect(callback.session.encryptedTokenBundle).not.toContain("server-only-access-token");
    expect(oidc.exchanges).toBe(1);

    await expect(service.completeCallback({ state, code: "replayed-code" })).rejects.toMatchObject({ status: 400 });
    expect(oidc.exchanges).toBe(1);

    const view = await service.sessionView(callback.sessionId);
    expect(view).toMatchObject({ authenticated: true, subject: "academy-subject-001", roles: ["learner"] });

    await expect(service.logout(callback.sessionId, "wrong-csrf")).rejects.toMatchObject({ status: 403 });
    expect(await service.sessionView(callback.sessionId)).not.toBeNull();

    await service.logout(callback.sessionId, callback.session.csrfToken);
    expect(await service.sessionView(callback.sessionId)).toBeNull();
  });

  it("fails an expired authorization transaction before code exchange", async () => {
    const store = new MemoryStore();
    const oidc = new FakeOidc();
    let now = new Date("2026-08-23T15:00:00.000Z");
    const service = new IdentityBffService(config(), store, oidc, () => now);
    const login = await service.startLogin("/");
    const state = new URL(login.location).searchParams.get("state");

    now = new Date("2026-08-23T15:06:00.000Z");
    await expect(service.completeCallback({ state, code: "expired-code" })).rejects.toMatchObject({ status: 400 });
    expect(oidc.exchanges).toBe(0);
  });
});

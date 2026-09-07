const rawBase = process.env.IDENTITY_BFF_STAGING_URL || process.argv[2] || "https://portal.skunkworksacademy.com";
const base = new URL(rawBase);
if (base.protocol !== "https:") throw new Error("Identity BFF staging must use HTTPS");
base.pathname = "/";
base.search = "";
base.hash = "";

const expectedOrigin = base.origin;
const apiBase = process.env.IDENTITY_BFF_DIRECT_API_URL
  ? new URL(process.env.IDENTITY_BFF_DIRECT_API_URL)
  : null;

function sameOrigin(pathname) {
  return new URL(pathname, expectedOrigin);
}

function requireHeader(response, name, expectedPart) {
  const value = response.headers.get(name) || "";
  if (!value.toLowerCase().includes(expectedPart.toLowerCase())) {
    throw new Error(`${name} did not contain ${expectedPart}: ${value || "<missing>"}`);
  }
  return value;
}

async function request(pathname, init = {}) {
  return fetch(sameOrigin(pathname), { redirect: "manual", ...init });
}

const results = [];
function record(name, details) {
  results.push({ name, ok: true, details });
  console.log(`PASS: ${name} — ${details}`);
}

async function main() {
  const session = await request("/session");
  if (session.status !== 200) {
    throw new Error(`GET /session must be available on the Portal origin in staging; got HTTP ${session.status}`);
  }
  requireHeader(session, "cache-control", "no-store");
  requireHeader(session, "cache-control", "private");
  const sessionBody = await session.json();
  if (sessionBody?.authenticated !== false) {
    throw new Error("Anonymous /session must return { authenticated: false }");
  }
  if ("accessToken" in sessionBody || "refreshToken" in sessionBody || "sessionId" in sessionBody) {
    throw new Error("/session leaked provider/session secrets");
  }
  record("same-origin anonymous session", "minimal anonymous view with no-store/private caching");

  const login = await request("/auth/login?returnTo=%2F");
  if (![302, 303].includes(login.status)) {
    throw new Error(`GET /auth/login must redirect to Entra; got HTTP ${login.status}`);
  }
  const location = login.headers.get("location");
  if (!location) throw new Error("/auth/login did not return Location");
  const authorize = new URL(location);
  if (authorize.hostname.toLowerCase() !== "login.microsoftonline.com") {
    throw new Error(`Login redirect host is not Microsoft Entra: ${authorize.hostname}`);
  }
  if (authorize.searchParams.get("code_challenge_method") !== "S256") {
    throw new Error("Entra authorization request is not using PKCE S256");
  }
  for (const key of ["code_challenge", "nonce", "state"]) {
    if (!authorize.searchParams.get(key)) throw new Error(`Entra authorization request is missing ${key}`);
  }
  const redirectUri = authorize.searchParams.get("redirect_uri");
  if (redirectUri !== `${expectedOrigin}/auth/callback`) {
    throw new Error(`Entra redirect_uri is not same-origin: ${redirectUri}`);
  }

  const setCookie = login.headers.get("set-cookie") || "";
  for (const required of ["__Host-swa_auth_tx=", "Secure", "HttpOnly", "SameSite=Lax"]) {
    if (!setCookie.includes(required)) throw new Error(`Pre-auth cookie is missing ${required}`);
  }
  if (/Domain=/i.test(setCookie)) throw new Error("Pre-auth cookie must remain host-only");
  record("PKCE and browser binding", "S256 + nonce/state + host-only Secure HttpOnly transaction cookie");

  const unboundCallback = await request("/auth/callback?state=not-the-issued-state&code=invalid");
  if (unboundCallback.status !== 400) {
    throw new Error(`Unbound callback must fail with HTTP 400; got ${unboundCallback.status}`);
  }
  const callbackCookie = unboundCallback.headers.get("set-cookie") || "";
  if (callbackCookie && /__Host-swa_session=[^;]/.test(callbackCookie)) {
    throw new Error("Rejected callback unexpectedly issued an application session");
  }
  record("callback binding rejection", "unbound callback fails before session creation");

  const crossOriginLogout = await request("/auth/logout", {
    method: "POST",
    headers: {
      Origin: "https://attacker.invalid",
      "X-CSRF-Token": "invalid"
    }
  });
  if (crossOriginLogout.status !== 403) {
    throw new Error(`Cross-origin logout must fail with HTTP 403; got ${crossOriginLogout.status}`);
  }
  record("same-origin write boundary", "cross-origin logout rejected");

  if (apiBase) {
    const direct = new URL("/api/session", apiBase);
    const directResponse = await fetch(direct, { redirect: "manual" });
    if (directResponse.status !== 421) {
      throw new Error(`Direct API host must not be accepted as browser session authority; got HTTP ${directResponse.status}`);
    }
    record("direct API boundary", "direct API hostname rejected as browser session authority");
  }

  console.log(JSON.stringify({
    origin: expectedOrigin,
    passed: results.length,
    results
  }, null, 2));
}

main().catch(error => {
  console.error("Identity BFF staging verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

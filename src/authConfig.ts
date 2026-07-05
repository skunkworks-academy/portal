import type { Configuration, RedirectRequest } from "@azure/msal-browser";

const browserOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const skunkworksTenantId =
  import.meta.env.VITE_SKUNKWORKS_TENANT_ID ?? "972e8de4-e365-43a3-99ec-c86a0cc249e8";

export const defaultPortalClientId = "8b1e77b3-3017-4c54-8ab3-0e4864511b55";
export const portalApiClientId = import.meta.env.VITE_API_CLIENT_ID ?? defaultPortalClientId;
export const portalClientId = import.meta.env.VITE_MSAL_CLIENT_ID ?? defaultPortalClientId;
export const portalApplicationObjectId = "3646dd6d-5ed7-4ea6-96b7-3c8f45fb93c9";
export const portalApplicationIdUri = import.meta.env.VITE_APPLICATION_ID_URI ?? `api://${portalApiClientId}`;
export const portalManagedApplicationName = "Skunkworks Academy Portal API";
export const portalSupportedAccountTypes = "All Microsoft account users";
export const portalCredentialSummary = "0 certificates, 2 client secrets configured in Entra";

export const portalApiScope = `${portalApplicationIdUri}/access_as_user`;

const reservedOidcScopes = new Set(["openid", "profile", "email", "offline_access"]);
const guidScopePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

function normalizeApiScope(rawScope?: string) {
  const configuredScope = rawScope?.trim();
  if (!configuredScope) return portalApiScope;

  const candidates = configuredScope
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0 && !reservedOidcScopes.has(scope));

  const candidate = candidates.at(-1) ?? configuredScope;

  if (candidate === "access_as_user" || candidate === "/access_as_user") {
    return portalApiScope;
  }

  if (candidate.startsWith("/")) {
    return `${portalApplicationIdUri}${candidate}`;
  }

  if (candidate.startsWith("api://") || candidate.startsWith("https://") || guidScopePattern.test(candidate)) {
    return candidate;
  }

  return `${portalApplicationIdUri}/${candidate.replace(/^\/+/, "")}`;
}

export const apiScope = normalizeApiScope(import.meta.env.VITE_API_SCOPE);

const configuredAuthority = import.meta.env.VITE_MSAL_AUTHORITY;

export const msalAuthority =
  configuredAuthority && configuredAuthority.trim().length > 0
    ? configuredAuthority
    : `https://login.microsoftonline.com/${skunkworksTenantId}`;

const redirectBase = browserOrigin.endsWith("/") ? browserOrigin.slice(0, -1) : browserOrigin;

export const msalConfig: Configuration = {
  auth: {
    clientId: portalClientId,
    authority: msalAuthority,
    redirectUri: `${redirectBase}/`,
    postLogoutRedirectUri: `${redirectBase}/`,
    navigateToLoginRequestUrl: false
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false
  },
  system: {
    allowNativeBroker: false
  }
};

export const loginRequest: RedirectRequest = {
  scopes: ["openid", "profile", "email", "offline_access", apiScope],
  prompt: "select_account"
};

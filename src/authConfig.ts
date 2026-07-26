import type { Configuration, RedirectRequest } from "@azure/msal-browser";

const browserOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
const canonicalPortalOrigin = "https://portal.skunkworksacademy.com";

const canonicalTenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5";
const canonicalPortalClientId = "e22672ae-61a6-434e-b135-3360557819ec";
const blockedApplicationIds = [
  "21f093b0-e91a-4f62-ad71-2dee1e0cbc20",
  "8b1e77b3-3017-4c54-8ab3-0e4864511b55"
];
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const guidScopePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;
const allowCustomEntraApp = import.meta.env.VITE_ALLOW_CUSTOM_ENTRA_APP === "true";
const reservedOidcScopes = new Set(["openid", "profile", "email", "offline_access"]);

function configuredValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function usesBlockedApplicationId(value?: string) {
  const normalized = value?.toLowerCase() ?? "";
  return blockedApplicationIds.some((appId) => normalized.includes(appId));
}

function isCanonicalApplicationValue(value?: string) {
  if (!value) return false;
  return value === canonicalPortalClientId || value === `api://${canonicalPortalClientId}` || value.startsWith(`api://${canonicalPortalClientId}/`);
}

export const authConfigurationWarnings: string[] = [];

function resolveTenantId(rawValue?: string) {
  const value = configuredValue(rawValue);
  if (!value) return canonicalTenantId;
  if (!allowCustomEntraApp && value !== canonicalTenantId) {
    authConfigurationWarnings.push("VITE_SKUNKWORKS_TENANT_ID attempted to use a non-canonical tenant; using the SKUNKWORKS tenant.");
    return canonicalTenantId;
  }
  return value;
}

function resolvePortalApplicationId(rawValue: string | undefined, settingName: string) {
  const value = configuredValue(rawValue);
  if (!value) return canonicalPortalClientId;
  if (usesBlockedApplicationId(value)) {
    authConfigurationWarnings.push(`${settingName} referenced a retired portal application; using ${canonicalPortalClientId}.`);
    return canonicalPortalClientId;
  }
  if (!guidPattern.test(value)) {
    authConfigurationWarnings.push(`${settingName} is not a valid application client ID; using ${canonicalPortalClientId}.`);
    return canonicalPortalClientId;
  }
  if (!allowCustomEntraApp && value !== canonicalPortalClientId) {
    authConfigurationWarnings.push(`${settingName} attempted to override the Skunkworks Academy Portal app. Set VITE_ALLOW_CUSTOM_ENTRA_APP=true only after installing that app in the tenant.`);
    return canonicalPortalClientId;
  }
  return value;
}

function resolveApplicationIdUri(rawValue: string | undefined, clientId: string) {
  const fallback = `api://${clientId}`;
  const value = configuredValue(rawValue);
  if (!value) return fallback;
  if (usesBlockedApplicationId(value)) {
    authConfigurationWarnings.push(`VITE_APPLICATION_ID_URI referenced a retired portal application; using ${fallback}.`);
    return fallback;
  }
  if (!allowCustomEntraApp && !isCanonicalApplicationValue(value)) {
    authConfigurationWarnings.push("VITE_APPLICATION_ID_URI attempted to use a non-canonical application URI; using the Skunkworks Academy Portal API URI.");
    return fallback;
  }
  return value.replace(/\/$/, "");
}

function resolveAuthority(rawValue: string | undefined, tenantId: string) {
  const fallback = `https://login.microsoftonline.com/${tenantId}`;
  const value = configuredValue(rawValue);
  if (!value) return fallback;
  if (!allowCustomEntraApp && !value.toLowerCase().includes(tenantId.toLowerCase())) {
    authConfigurationWarnings.push("VITE_MSAL_AUTHORITY attempted to use a non-canonical authority; using the SKUNKWORKS tenant authority.");
    return fallback;
  }
  return value.replace(/\/$/, "");
}

export const skunkworksTenantId = resolveTenantId(import.meta.env.VITE_SKUNKWORKS_TENANT_ID);
export const defaultPortalClientId = canonicalPortalClientId;
export const portalApiClientId = resolvePortalApplicationId(import.meta.env.VITE_API_CLIENT_ID, "VITE_API_CLIENT_ID");
export const portalClientId = resolvePortalApplicationId(import.meta.env.VITE_MSAL_CLIENT_ID, "VITE_MSAL_CLIENT_ID");
export const portalApplicationObjectId = "5546429d-1373-49ab-b587-67deba7e84c0";
export const portalApplicationIdUri = resolveApplicationIdUri(import.meta.env.VITE_APPLICATION_ID_URI, portalApiClientId);
export const portalManagedApplicationName = "Skunkworks Academy Portal";
export const portalSupportedAccountTypes = "Accounts in any Microsoft Entra ID tenant and personal Microsoft accounts";
export const portalCredentialSummary = "SPA authentication uses authorization code flow with PKCE; no client secret is used in the browser";
export const portalApiScope = `${portalApplicationIdUri}/access_as_user`;

function normalizeApiScope(rawScope?: string) {
  const configuredScope = configuredValue(rawScope);
  if (!configuredScope) return portalApiScope;
  if (usesBlockedApplicationId(configuredScope)) {
    authConfigurationWarnings.push(`VITE_API_SCOPE referenced a retired portal application; using ${portalApiScope}.`);
    return portalApiScope;
  }
  const candidates = configuredScope.split(/\s+/).map((scope) => scope.trim()).filter((scope) => scope.length > 0 && !reservedOidcScopes.has(scope));
  const candidate = candidates.at(-1) ?? configuredScope;
  if (candidate === "access_as_user" || candidate === "/access_as_user") return portalApiScope;
  if (candidate.startsWith("/")) return `${portalApplicationIdUri}${candidate}`;
  if (!allowCustomEntraApp && (candidate.startsWith("api://") || guidScopePattern.test(candidate)) && !isCanonicalApplicationValue(candidate)) {
    authConfigurationWarnings.push("VITE_API_SCOPE attempted to request a non-canonical API application scope; using the Skunkworks Academy Portal API scope.");
    return portalApiScope;
  }
  if (candidate.startsWith("api://") || candidate.startsWith("https://") || guidScopePattern.test(candidate)) return candidate;
  return `${portalApplicationIdUri}/${candidate.replace(/^\/+/, "")}`;
}

export const apiScope = normalizeApiScope(import.meta.env.VITE_API_SCOPE);
export const msalAuthority = resolveAuthority(import.meta.env.VITE_MSAL_AUTHORITY, skunkworksTenantId);

function resolveAuthenticationBase() {
  if (browserOrigin === "http://localhost" || browserOrigin.startsWith("http://localhost:") || browserOrigin.startsWith("https://localhost:")) {
    return browserOrigin.replace(/\/$/, "");
  }
  if (browserOrigin !== canonicalPortalOrigin) {
    authConfigurationWarnings.push(`Authentication was requested from ${browserOrigin}; redirecting through ${canonicalPortalOrigin}.`);
  }
  return canonicalPortalOrigin;
}

export const authenticationBase = resolveAuthenticationBase();

export const msalConfig: Configuration = {
  auth: {
    clientId: portalClientId,
    authority: msalAuthority,
    redirectUri: `${authenticationBase}/`,
    postLogoutRedirectUri: `${canonicalPortalOrigin}/`,
    navigateToLoginRequestUrl: true
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false
  },
  system: {
    allowNativeBroker: false
  }
};

// Keep interactive sign-in limited to OpenID Connect scopes. Requesting the
// custom API scope here makes the entire login fail with AADSTS500011 when the
// API service principal or delegated scope has not yet been provisioned.
export const loginRequest: RedirectRequest = {
  scopes: ["openid", "profile", "email", "offline_access"],
  prompt: "select_account"
};

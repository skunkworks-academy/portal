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
export const apiScope = import.meta.env.VITE_API_SCOPE ?? portalApiScope;

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

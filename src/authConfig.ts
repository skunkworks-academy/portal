import type { Configuration, RedirectRequest } from "@azure/msal-browser";

const browserOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const skunkworksTenantId =
  import.meta.env.VITE_SKUNKWORKS_TENANT_ID ?? "972e8de4-e365-43a3-99ec-c86a0cc249e8";

export const portalClientId =
  import.meta.env.VITE_MSAL_CLIENT_ID ?? "21f093b0-e91a-4f62-ad71-2dee1e0cbc20";

export const apiScope =
  import.meta.env.VITE_API_SCOPE ?? "api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user";

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
  }
};

export const loginRequest: RedirectRequest = {
  scopes: ["openid", "profile", "email", "offline_access", apiScope],
  prompt: "select_account"
};

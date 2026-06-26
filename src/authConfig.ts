import type { Configuration, RedirectRequest } from "@azure/msal-browser";

const browserOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const skunkworksTenantId =
  import.meta.env.VITE_SKUNKWORKS_TENANT_ID ?? "972e8de4-e365-43a3-99ec-c86a0cc249e8";

export const portalClientId =
  import.meta.env.VITE_MSAL_CLIENT_ID ?? "8b1e77b3-3017-4c54-8ab3-0e4864511b55";

export const apiScope =
  import.meta.env.VITE_API_SCOPE ?? "api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user";

const configuredAuthority = import.meta.env.VITE_MSAL_AUTHORITY;

export const msalAuthority =
  configuredAuthority && configuredAuthority.trim().length > 0
    ? configuredAuthority
    : "https://login.microsoftonline.com/common";

export const msalConfig: Configuration = {
  auth: {
    clientId: portalClientId,
    authority: msalAuthority,
    redirectUri: browserOrigin + "/",
    postLogoutRedirectUri: browserOrigin + "/"
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

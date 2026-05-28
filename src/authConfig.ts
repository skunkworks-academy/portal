import type { Configuration, RedirectRequest } from "@azure/msal-browser";

export const skunkworksTenantId =
  import.meta.env.VITE_SKUNKWORKS_TENANT_ID ?? "972e8de4-e365-43a3-99ec-c86a0cc249e8";

export const apiScope =
  import.meta.env.VITE_API_SCOPE ?? "api://00000000-0000-0000-0000-000000000000/access_as_user";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID ?? "00000000-0000-0000-0000-000000000000",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin + "/",
    postLogoutRedirectUri: window.location.origin + "/"
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false
  }
};

export const loginRequest: RedirectRequest = {
  scopes: ["openid", "profile", "email"],
  prompt: "select_account"
};

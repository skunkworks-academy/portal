import { describe, expect, it } from "vitest";
import { apiScope, loginRequest, msalConfig, msalAuthority, portalSupportedAccountTypes } from "../src/authConfig";

describe("Microsoft Entra auth configuration", () => {
  it("keeps interactive sign-in limited to OpenID Connect scopes", () => {
    expect(loginRequest.scopes).toContain("openid");
    expect(loginRequest.scopes).toContain("profile");
    expect(loginRequest.scopes).toContain("email");
    expect(loginRequest.scopes).toContain("offline_access");
    expect(loginRequest.scopes).not.toContain(apiScope);
    expect(apiScope).toMatch(/\/access_as_user$/);
  });

  it("accepts both organisational and personal Microsoft accounts", () => {
    expect(msalAuthority).toBe("https://login.microsoftonline.com/common");
    expect(msalConfig.auth.authority).toBe(msalAuthority);
    expect(portalSupportedAccountTypes).toContain("personal Microsoft accounts");
  });

  it("keeps redirect URIs absolute when evaluated outside a browser", () => {
    expect(msalConfig.auth.redirectUri).toMatch(/^https?:\/\//);
    expect(msalConfig.auth.postLogoutRedirectUri).toMatch(/^https?:\/\//);
  });
});

import { describe, expect, it } from "vitest";
import { apiScope, loginRequest, msalConfig } from "../src/authConfig";

describe("Microsoft Entra auth configuration", () => {
  it("requests the portal API scope during sign-in", () => {
    expect(loginRequest.scopes).toContain("openid");
    expect(loginRequest.scopes).toContain("profile");
    expect(loginRequest.scopes).toContain("email");
    expect(loginRequest.scopes).toContain(apiScope);
  });

  it("keeps redirect URIs absolute when evaluated outside a browser", () => {
    expect(msalConfig.auth.redirectUri).toMatch(/^https?:\/\//);
    expect(msalConfig.auth.postLogoutRedirectUri).toMatch(/^https?:\/\//);
  });
});

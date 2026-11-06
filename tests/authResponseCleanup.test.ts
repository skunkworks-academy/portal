import { describe, expect, it } from "vitest";
import { cleanAuthResponseUrl } from "../src/auth-response-cleanup";

describe("Consumed sign-in response cleanup", () => {
  it("removes credentials and client information from a completed fragment", () => {
    expect(cleanAuthResponseUrl("https://portal.example/?view=learning#code=synthetic&client_info=synthetic&state=abc&session_state=xyz"))
      .toBe("https://portal.example/?view=learning");
  });
  it("clears error responses and query responses without removing unrelated parameters", () => {
    expect(cleanAuthResponseUrl("https://portal.example/?view=learning&code=synthetic&state=abc#courses"))
      .toBe("https://portal.example/?view=learning#courses");
    expect(cleanAuthResponseUrl("https://portal.example/#error=denied&error_description=private&state=abc"))
      .toBe("https://portal.example/");
  });
  it("preserves ordinary anchors and navigation state", () => {
    for (const url of ["https://portal.example/#courses", "https://portal.example/?state=filters#learning", "https://portal.example/#tab=courses"]) {
      expect(cleanAuthResponseUrl(url)).toBe(url);
    }
  });
  it("removes token response fields as well", () => {
    expect(cleanAuthResponseUrl("https://portal.example/#access_token=synthetic&id_token=synthetic&expires_in=3600&token_type=Bearer&scope=openid&tab=learning"))
      .toBe("https://portal.example/#tab=learning");
  });
});

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PortalLanding } from "../src/landing-page";
import { capturePublicReturn, PUBLIC_RETURN_TTL, readPublicReturn, validatePublicReturnUrl } from "../src/public-return";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("Public learner identity release", () => {
  it("offers separate sign-in and first-time learner onboarding entry points", () => {
    const html = renderToStaticMarkup(createElement(PortalLanding, { onSignIn: () => undefined, onRegister: () => undefined }));
    expect(html).toContain("Sign in with Microsoft");
    expect(html).toContain("Create learner profile");
    expect(html).toContain("https://signup.live.com/");
    expect(html).not.toMatch(/<input[^>]*type="password"/i);
    expect(html).not.toContain("Staff workspace");
  });

  it("connects both actions to the same identity provider and never grants staff roles during registration", () => {
    const app = source("src/App.tsx");
    const landing = source("src/landing-page.tsx");
    expect(app).toContain('onSignIn={() => signIn("Student")}');
    expect(app).toContain('onRegister={() => signIn("Student")}');
    expect(landing).toContain('mode === "register" ? onRegister() : onSignIn()');
    expect(app).toContain('await instance.loginRedirect(loginRequest)');
  });

  it("stores only a tab-scoped browser MSAL session until the protected BFF release is activated", () => {
    const config = source("src/authConfig.ts");
    expect(config).toContain('cacheLocation: "sessionStorage"');
    expect(config).toContain('storeAuthStateInCookie: false');
    expect(config).not.toContain('cacheLocation: "localStorage"');
    const bff = source("api/identityBff.ts");
    expect(bff).toContain("__Host-swa_session");
    expect(bff).toContain("HttpOnly");
    expect(bff).toContain("SameSite=Lax");
    expect(bff).toContain("AzureTableIdentityStore");
  });

  it("supports the original approved public page without allowing OAuth callback or open redirects", () => {
    const destination = "https://www.skunkworksacademy.com/courses/?q=azure#details";
    const cache = new Map<string, string>();
    const storage = { getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => void cache.set(key, value),
      removeItem: (key: string) => void cache.delete(key) };
    const entry = "https://portal.skunkworksacademy.com/?returnTo=" + encodeURIComponent(destination);
    expect(capturePublicReturn(entry, storage, 100).destination).toBe(destination);
    expect(readPublicReturn(storage, 100 + PUBLIC_RETURN_TTL - 1)).toBe(destination);
    expect(readPublicReturn(storage, 100 + PUBLIC_RETURN_TTL)).toBeNull();
    expect(validatePublicReturnUrl("https://skunkworksacademy.com.evil.invalid/")).toBeNull();
    expect(validatePublicReturnUrl("https://www.skunkworksacademy.com/?code=secret")).toBeNull();
  });

  it("does not show authenticated or privileged workspace content before Microsoft has resolved identity", () => {
    const bootstrap = source("src/main.tsx");
    expect(bootstrap).toContain("if (activeAccount && destination)");
    expect(bootstrap).toContain("<PostSignInChoice");
    expect(bootstrap).toContain("clearAuthResponseFromAddressBar()");
    expect(bootstrap).toContain("clearPublicReturn(returnStorage)");
  });
});

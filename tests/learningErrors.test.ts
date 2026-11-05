import { afterEach, describe, expect, it, vi } from "vitest";
import { portalApi } from "../src/api";
import { PortalApiError } from "../src/api-error";
import { learningErrorMessage } from "../src/learning-errors";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

afterEach(() => vi.unstubAllGlobals());
const auth = {
  instance: { acquireTokenSilent: async () => ({ accessToken: "test-only-token" }) } as unknown as IPublicClientApplication,
  account: { homeAccountId: "test-account" } as AccountInfo
};

describe("learning errors retain the response status", () => {
  it.each([401, 403, 503])("preserves HTTP %i even with a generic response body", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Request rejected", { status })));
    await expect(portalApi.myIdrRoadmap(auth)).rejects.toMatchObject({ status, message: "Request rejected" });
  });

  it.each(["lms", "idr", "assessment", "skunkie"] as const)("distinguishes access from availability for %s", service => {
    const denied = learningErrorMessage(new PortalApiError(403, "Forbidden"), service);
    expect(denied).toContain("Access to");
    expect(denied).toContain("denied");
    expect(denied).not.toMatch(/unavailable|database|Sign in again/);
    const unavailable = learningErrorMessage(new PortalApiError(503, "Service unavailable"), service);
    expect(unavailable).toMatch(/unavailable|not ready/);
    expect(unavailable).not.toContain("denied");
    expect(learningErrorMessage(new PortalApiError(401, "Unauthorized"), service)).toContain("Sign in again");
  });

  it("uses the status before misleading response text and hides gateway markup", () => {
    expect(learningErrorMessage(new PortalApiError(403, "<html>database unavailable</html>"), "idr"))
      .toBe("Access to your private IDR was denied for this Microsoft account. Contact Academy support to check your access.");
  });

  it("does not turn a rejected private read into an empty roadmap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })));
    await expect(portalApi.myIdrRoadmap(auth)).rejects.toBeInstanceOf(PortalApiError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)));
    await expect(portalApi.myIdrRoadmap(auth)).resolves.toBeNull();
  });
});

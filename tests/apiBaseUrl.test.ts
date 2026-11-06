import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("portal API origin selection", () => {
  it.each([
    ["http://localhost:4191", "", "/api/health"],
    ["http://127.0.0.1:5173", "", "/api/health"],
    ["https://portal.skunkworksacademy.com", "", "https://api.skunkworksacademy.com/api/health"],
    ["http://localhost:4191", " https://example.invalid/api/ ", "https://example.invalid/api/health"]
  ])("uses the expected endpoint for %s and configured override %s", async (origin, configured, expected) => {
    vi.resetModules();
    vi.stubGlobal("window", { location: new URL(origin) });
    vi.stubEnv("VITE_API_BASE_URL", configured);
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    const { portalApi } = await import("../src/api");
    await portalApi.health();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(expected);
  });
});

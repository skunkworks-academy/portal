import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SKUNKIE_AVATAR_SRC } from "./skunkie-assets";

describe("Skunkie's canonical avatar", () => {
  it("ships a real, optimized WebP image at the shared public path", () => {
    const bytes = readFileSync(`public${SKUNKIE_AVATAR_SRC}`);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

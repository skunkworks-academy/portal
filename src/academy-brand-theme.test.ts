import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("./academy-brand-theme.css", import.meta.url), "utf8");

describe("Academy global theme conformance", () => {
  it("tracks the Academy canonical brand contract", () => {
    expect(stylesheet).toContain('--swa-portal-theme-contract-version: "2026.09.08.3"');
    for (const colour of ["#1e6bd0", "#f24208", "#03033a", "#f7f9fc", "#15171a"]) {
      expect(stylesheet.toLowerCase()).toContain(colour);
    }
  });

  it("supports manual light/dark preferences and system dark mode", () => {
    expect(stylesheet).toContain(':root[data-theme="dark"]');
    expect(stylesheet).toContain(':root[data-swa-theme="dark"]');
    expect(stylesheet).toContain(':root[data-theme="light"]');
    expect(stylesheet).toContain(':root[data-swa-theme="light"]');
    expect(stylesheet).toContain("prefers-color-scheme: dark");
  });

  it("keeps accessible focus and reduced-motion contracts", () => {
    expect(stylesheet).toContain("button:focus-visible");
    expect(stylesheet).toContain("prefers-reduced-motion: reduce");
  });
});

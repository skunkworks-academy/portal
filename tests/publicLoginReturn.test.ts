import { describe, expect, it } from "vitest";
import { publicReturnDestination } from "../src/public-login-return";

function query(url: string) {
  return "?start=signin&returnTo=" + encodeURIComponent(url);
}

describe("public page return destination", () => {
  it("preserves the original Academy path, query and fragment", () => {
    const target = "https://www.skunkworksacademy.com/courses/?level=advanced#modules";
    expect(publicReturnDestination(query(target))).toBe(target);
  });
  it("accepts named Academy public properties and Connections", () => {
    expect(publicReturnDestination(query("https://microsoft.skunkworksacademy.com/training/")))
      .toBe("https://microsoft.skunkworksacademy.com/training/");
    expect(publicReturnDestination(query("https://portal.skunkworksacademy.com/connections/")))
      .toBe("https://portal.skunkworksacademy.com/connections/");
  });
  it.each([
    "https://skunkworksacademy.com.evil.test/",
    "https://evil.test/",
    "https://maliciousskunkworksacademy.com/",
    "http://www.skunkworksacademy.com/",
    "javascript:alert(1)",
    "https://user:pass@www.skunkworksacademy.com/",
    "https://www.skunkworksacademy.com:8443/",
    "//www.skunkworksacademy.com/",
    "https://www.skunkworksacademy.com\\@evil.test/"
  ])("rejects an unsafe return target: %s", (target) => {
    expect(publicReturnDestination(query(target))).toBeNull();
  });
  it("rejects missing, oversized or malformed destinations", () => {
    expect(publicReturnDestination("")).toBeNull();
    expect(publicReturnDestination(query("https://www.skunkworksacademy.com/" + "x".repeat(2100)))).toBeNull();
    expect(publicReturnDestination("?returnTo=%00")).toBeNull();
  });
});

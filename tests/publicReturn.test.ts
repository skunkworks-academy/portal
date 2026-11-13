import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { PUBLIC_RETURN_KEY, PUBLIC_RETURN_TTL, validatePublicReturnUrl, savePublicReturn, readPublicReturn, clearPublicReturn, capturePublicReturn } from "../src/public-return";

const valid = "https://www.skunkworksacademy.com/learning-paths/?q=cloud%20security&level=beginner#modules";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("public-page return destination", () => {
  for (const value of [valid, "https://skunkworksacademy.com/", "https://microsoft.skunkworksacademy.com/paths/data/", "https://portal.skunkworksacademy.com/connections/#planner", "https://catalog.skunkworksacademy.com/courses/catalog", "https://www.skunkworksacademy.com:443/guides/"]) {
    it(`accepts ${value}`, () => assert.equal(validatePublicReturnUrl(value), new URL(value).href));
  }
  for (const value of [
    null, {}, "", "/courses/", "//evil.example", "javascript:alert(1)", "data:text/html,hello",
    "http://www.skunkworksacademy.com/", "https://evil.example/", "https://skunkworksacademy.com.evil.example/",
    "https://unapproved.skunkworksacademy.com/", "https://www.skunkworksacademy.com./",
    "https://www.skunkworksacademy.com@evil.example/", "https://evil.example@www.skunkworksacademy.com/",
    "https://www.skunkworksacademy.com:444/", "https://www.skunkworksacademy.com\\@evil.example/",
    "https://www.skunkworksacademy.com/\n", "https://portal.skunkworksacademy.com/", "https://portal.skunkworksacademy.com/reports/",
    "https://www.skunkworksacademy.com/auth/login", "https://www.skunkworksacademy.com/%61uth/callback",
    "https://www.skunkworksacademy.com/.auth/login/aad", "https://www.skunkworksacademy.com/%00",
    "https://www.skunkworksacademy.com/%zz", "https://www.skunkworksacademy.com/?code=secret",
    "https://www.skunkworksacademy.com/?%73tate=secret", "https://www.skunkworksacademy.com/?access_token=secret",
    "https://www.skunkworksacademy.com/?returnTo=https://evil.example/", "https://www.skunkworksacademy.com/?next=https://evil.example/",
    "https://www.skunkworksacademy.com/#code=secret&state=secret", "https://www.skunkworksacademy.com/#/route?access_token=secret",
    "https://www.skunkworksacademy.com/#%00", "https://www.skunkworksacademy.com/" + "a".repeat(4096)
  ]) {
    it(`rejects unsafe destination ${String(value).slice(0, 100)}`, () => assert.equal(validatePublicReturnUrl(value), null));
  }
  it("persists only a validated navigation hint", () => {
    const s = storage(); savePublicReturn(valid, s, 100);
    assert.deepEqual(JSON.parse(s.getItem(PUBLIC_RETURN_KEY)!), { url: valid, createdAt: 100 });
    assert.equal(readPublicReturn(s, 101), valid);
    clearPublicReturn(s); assert.equal(readPublicReturn(s, 102), null);
  });
  it("expires at thirty minutes, including stored data cleanup", () => {
    const s = storage(); savePublicReturn(valid, s, 100);
    assert.equal(readPublicReturn(s, 100 + PUBLIC_RETURN_TTL - 1), valid);
    assert.equal(readPublicReturn(s, 100 + PUBLIC_RETURN_TTL), null);
    assert.equal(s.getItem(PUBLIC_RETURN_KEY), null);
  });
  it("rejects future timestamps and malformed storage", () => {
    const s = storage(); savePublicReturn(valid, s, 100);
    assert.equal(readPublicReturn(s, 99), null);
    s.setItem(PUBLIC_RETURN_KEY, "{"); assert.equal(readPublicReturn(s, 100), null);
    s.setItem(PUBLIC_RETURN_KEY, JSON.stringify({ url: valid, createdAt: "100" })); assert.equal(readPublicReturn(s, 100), null);
    s.setItem(PUBLIC_RETURN_KEY, JSON.stringify({ url: "https://evil.example/", createdAt: 100 })); assert.equal(readPublicReturn(s, 100), null);
  });
  it("handles blocked storage without affecting sign-in", () => {
    const blocked = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); }, removeItem: () => { throw Error("blocked"); } };
    assert.equal(savePublicReturn(valid, blocked), valid);
    assert.equal(readPublicReturn(blocked), null);
    assert.doesNotThrow(() => clearPublicReturn(blocked));
    assert.equal(savePublicReturn(valid, null), valid);
  });
  it("removes only returnTo before MSAL and preserves callback state", () => {
    const s = storage();
    const entry = `https://portal.skunkworksacademy.com/?role=student&returnTo=${encodeURIComponent(valid)}#code=oidc-code&state=oidc-state`;
    const result = capturePublicReturn(entry, s, 100);
    assert.equal(result.destination, valid);
    assert.equal(result.cleanHref, "https://portal.skunkworksacademy.com/?role=student#code=oidc-code&state=oidc-state");
    assert.equal(capturePublicReturn("https://portal.skunkworksacademy.com/", s, 101).destination, valid);
  });
  it("invalid and duplicate query hints clear stale destinations", () => {
    const s = storage(); savePublicReturn(valid, s, 100);
    const prefix = "https://portal.skunkworksacademy.com/?returnTo=";
    assert.equal(capturePublicReturn(prefix + encodeURIComponent("https://evil.example/"), s, 101).destination, null);
    savePublicReturn(valid, s, 102);
    assert.equal(capturePublicReturn(prefix + encodeURIComponent(valid) + "&returnTo=" + encodeURIComponent(valid), s, 103).destination, null);
    assert.equal(readPublicReturn(s, 104), null);
  });
  it("direct portal visits have no chooser destination", () => {
    assert.deepEqual(capturePublicReturn("https://portal.skunkworksacademy.com/", storage()), { destination: null, cleanHref: "https://portal.skunkworksacademy.com/" });
  });
});

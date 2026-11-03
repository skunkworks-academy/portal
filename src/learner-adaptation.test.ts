import { describe, expect, it, vi } from "vitest";
import {
  defaultLearnerPreferences,
  deleteBrowserLearnerPreferences,
  learnerStorageKey,
  readBrowserLearnerPreferences,
  saveBrowserLearnerPreferences,
  shouldShowSkunkieWelcome,
  recommendCourses,
  validateLearnerPreferences
} from "./learner-adaptation";

describe("Skunkie learner discovery", () => {
  it("shows only Skunkie during opted-in discovery, then yields to the dashboard", () => {
    expect(shouldShowSkunkieWelcome(false, true, false, false)).toBe(false);
    expect(shouldShowSkunkieWelcome(true, false, false, false)).toBe(true);
    expect(shouldShowSkunkieWelcome(true, true, false, false)).toBe(true);
    expect(shouldShowSkunkieWelcome(true, true, true, false)).toBe(false);
    expect(shouldShowSkunkieWelcome(true, true, false, true)).toBe(false);
  });

  it("accepts a complete, allowlisted learner profile", () => {
    expect(validateLearnerPreferences(defaultLearnerPreferences)).toEqual(defaultLearnerPreferences);
  });

  it("rejects injected theme CSS and unsupported choices", () => {
    expect(validateLearnerPreferences({ ...defaultLearnerPreferences, palette: "url(javascript:alert(1))" })).toBeNull();
    expect(validateLearnerPreferences({ ...defaultLearnerPreferences, format: "<script>" })).toBeNull();
    expect(validateLearnerPreferences({ ...defaultLearnerPreferences, confidence: 10 })).toBeNull();
    expect(validateLearnerPreferences(null)).toBeNull();
  });

  it("only keeps approved fields, not arbitrary learner notes or private data", () => {
    expect(validateLearnerPreferences({ ...defaultLearnerPreferences, secret: "private" }))
      .toEqual(defaultLearnerPreferences);
  });

  it("separates browser state keys by Microsoft account", () => {
    expect(learnerStorageKey("tenant:user-1")).not.toBe(learnerStorageKey("tenant:user-2"));
  });


  it("isolates saved and session-only profiles across different Microsoft accounts", () => {
    const memoryStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); }
      };
    };
    const session = memoryStorage();
    const local = memoryStorage();
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("localStorage", local);
    try {
      const first = { ...defaultLearnerPreferences, focus: "cloud" as const };
      const second = { ...defaultLearnerPreferences, focus: "cybersecurity" as const };
      saveBrowserLearnerPreferences("tenant:user-A", first, true);
      saveBrowserLearnerPreferences("tenant:user-B", second, false);
      expect(readBrowserLearnerPreferences("tenant:user-A")).toEqual(first);
      expect(readBrowserLearnerPreferences("tenant:user-B")).toEqual(second);
      expect(local.getItem(learnerStorageKey("tenant:user-A"))).not.toBeNull();
      expect(local.getItem(learnerStorageKey("tenant:user-B"))).toBeNull();

      // Revoking browser persistence must not destroy a different account's data.
      saveBrowserLearnerPreferences("tenant:user-A", second, false);
      expect(local.getItem(learnerStorageKey("tenant:user-A"))).toBeNull();
      expect(readBrowserLearnerPreferences("tenant:user-A")).toEqual(second);
      deleteBrowserLearnerPreferences("tenant:user-A");
      expect(readBrowserLearnerPreferences("tenant:user-A")).toBeNull();
      expect(readBrowserLearnerPreferences("tenant:user-B")).toEqual(second);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ranks only existing, matching courses without creating extra records", () => {
    const courses = [
      { title: "Business communication", description: "Practice talking", level: "Beginner" },
      { title: "Azure Cloud Essentials", description: "Cloud infrastructure", level: "Beginner" }
    ];
    const ranked = recommendCourses(courses, { ...defaultLearnerPreferences, focus: "cloud" });
    expect(ranked[0]).toBe(courses[1]);
    expect(ranked).toHaveLength(2);
    expect(recommendCourses([], defaultLearnerPreferences)).toEqual([]);
  });
});
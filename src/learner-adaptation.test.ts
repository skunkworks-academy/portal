import { describe, expect, it } from "vitest";
import {
  defaultLearnerPreferences,
  learnerStorageKey,
  recommendCourses,
  validateLearnerPreferences
} from "./learner-adaptation";

describe("Skunkie learner discovery", () => {
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
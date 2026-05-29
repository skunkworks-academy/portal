import { describe, expect, it } from "vitest";
import { fallbackClasses, fallbackCourses } from "../api/fallbackData";

describe("academic fallback data", () => {
  it("provides live courses and open classes for first-run registration", () => {
    expect(fallbackCourses.length).toBeGreaterThan(0);
    expect(fallbackClasses.length).toBeGreaterThan(0);
    expect(fallbackCourses.every((course) => course.status === "Live")).toBe(true);
    expect(fallbackClasses.every((classSession) => classSession.status === "Open")).toBe(true);
  });

  it("keeps class course references aligned to fallback courses", () => {
    const courseIds = new Set(fallbackCourses.map((course) => course.id));
    for (const classSession of fallbackClasses) {
      expect(courseIds.has(classSession.courseId)).toBe(true);
      expect(classSession.seats).toBeGreaterThan(0);
      expect(classSession.enrolled).toBeGreaterThanOrEqual(0);
    }
  });
});

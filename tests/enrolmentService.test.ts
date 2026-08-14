import { describe, expect, it } from "vitest";
import { isPublishedCourseId, normalizeEmail, publishedCourseCatalog } from "../api/enrolmentService.js";

describe("course enrolment contract", () => {
  it("publishes the three Docusaurus administration courses", () => {
    expect(publishedCourseCatalog.map((course) => course.id)).toEqual([
      "SHP-UPA-101",
      "GHP-DOM-101",
      "M365-LIC-101"
    ]);
  });

  it("accepts published course IDs case-insensitively", () => {
    expect(isPublishedCourseId("ghp-dom-101")).toBe(true);
    expect(isPublishedCourseId("M365-LIC-101")).toBe(true);
    expect(isPublishedCourseId("UNKNOWN-101")).toBe(false);
  });

  it("normalises learner email addresses before record matching", () => {
    expect(normalizeEmail("  Learner@Example.COM ")).toBe("learner@example.com");
  });
});

import { describe, expect, it, vi } from "vitest";
import { discoveryFilterOptions, emptyDiscoveryChoices, filterDiscoveryCourses, loadAcademyCatalogue, parseAcademyCatalogue, readDiscoveryChoices, saveDiscoveryChoices } from "../src/course-discovery";
import { enrolledLearning } from "../src/my-learning";
import type { LmsCourseRecord, LmsEnrolmentRecord } from "../src/api";

const rows = [
  ["CLOUD-1", "Cloud fundamentals", "Self-Paced", "Cloud", "Beginner", "6 hours", "https://www.skunkworksacademy.com/courses/cloud"],
  ["CLOUD-2", "Cloud architecture", "Instructor-led", "Cloud", "Advanced", "2 days", "https://skunkworks-academy.github.io/course-catalog/courses/cloud-architecture"],
  ["SEC-1", "Security fundamentals", "Self-Paced", "Cybersecurity", "Beginner", "8 hours", "https://www.skunkworksacademy.com/courses/security"]
];
const wrapper = (courses = rows) => `window.SKUNKWORKS_COURSE_CATALOG_DATA = ${JSON.stringify({ schema: "skunkworks-academy/public-course-listing/v2", generatedOn: "2026-09-06", fields: ["courseId", "title", "deliveryMode", "category", "level", "estimatedEffort", "courseUrl"], courseCount: courses.length, courses })};\nwindow.SKUNKWORKS_COURSE_CATALOG_PROMISE = Promise.resolve(window.SKUNKWORKS_COURSE_CATALOG_DATA);`;

describe("published Academy discovery", () => {
  it("uses canonical metadata without adding enrolment or progress", () => {
    const catalogue = parseAcademyCatalogue(wrapper());
    expect(catalogue.courses[0]).toEqual({ courseId: "CLOUD-1", title: "Cloud fundamentals", deliveryMode: "Self-Paced", category: "Cloud", level: "Beginner", estimatedEffort: "6 hours", courseUrl: rows[0][6] });
    expect(discoveryFilterOptions(catalogue.courses, "category")).toEqual(["Cloud", "Cybersecurity"]);
    expect(discoveryFilterOptions(catalogue.courses, "level")).toEqual(["Advanced", "Beginner"]);
  });

  it("intersects subject, level, delivery and multiword search; reset restores all results", () => {
    const courses = parseAcademyCatalogue(wrapper()).courses;
    const choices = { ...emptyDiscoveryChoices, category: "Cloud", level: "Beginner", deliveryMode: "Self-Paced" };
    expect(filterDiscoveryCourses(courses, "  FUNDAMENTALS cloud  ", choices).map(course => course.courseId)).toEqual(["CLOUD-1"]);
    expect(filterDiscoveryCourses(courses, "security", choices)).toEqual([]);
    expect(filterDiscoveryCourses(courses, "", emptyDiscoveryChoices)).toHaveLength(3);
  });

  it("rejects executable additions, broken schema, duplicate ids and unapproved overview links", () => {
    expect(() => parseAcademyCatalogue(wrapper() + "window.untrusted = true;")).toThrow();
    expect(() => parseAcademyCatalogue(wrapper().replace("listing/v2", "listing/v3"))).toThrow();
    expect(() => parseAcademyCatalogue(wrapper([rows[0], rows[0]]))).toThrow();
    for (const url of ["javascript:alert(1)", "https://evil.example/courses/cloud", "https://www.skunkworksacademy.com@evil.example/courses/cloud", "https://www.skunkworksacademy.com/register/cloud"]) {
      expect(() => parseAcademyCatalogue(wrapper([[...rows[0].slice(0, 6), url]]))).toThrow();
    }
  });

  it("fetches public data without account credentials and propagates fetch or parse failures", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(new Response(wrapper()));
    expect((await loadAcademyCatalogue(controller.signal, fetcher)).courses).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    await expect(loadAcademyCatalogue(undefined, vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })))).rejects.toThrow("403");
    await expect(loadAcademyCatalogue(undefined, vi.fn().mockResolvedValue(new Response("<html>error</html>")))).rejects.toThrow();
    await expect(loadAcademyCatalogue(undefined, vi.fn().mockRejectedValue(new TypeError("offline")))).rejects.toThrow("offline");
  });

  it("restores course selection and filters only for the matching Microsoft account", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const choice = { ...emptyDiscoveryChoices, selectedId: "CLOUD-2", level: "Advanced" };
    saveDiscoveryChoices(storage, "tenant.account-a", choice);
    expect(readDiscoveryChoices(storage, "tenant.account-a")).toEqual(choice);
    expect(readDiscoveryChoices(storage, "tenant.account-b")).toEqual(emptyDiscoveryChoices);
    expect(readDiscoveryChoices(storage, "")).toEqual(emptyDiscoveryChoices);
  });

  it("ignores malformed stored choices and does not claim storage success on failures", () => {
    expect(readDiscoveryChoices({ getItem: () => "{" }, "a")).toEqual(emptyDiscoveryChoices);
    expect(readDiscoveryChoices({ getItem: () => JSON.stringify({ version: 1, selectedId: 12 }) }, "a")).toEqual(emptyDiscoveryChoices);
    expect(() => saveDiscoveryChoices({ setItem: () => { throw new Error("blocked"); } }, "a", emptyDiscoveryChoices)).toThrow("blocked");
  });
});

describe("My learning data boundary", () => {
  const course = (id: string, organizationId = "org-a"): LmsCourseRecord => ({ id, organizationId, title: id, description: "", status: "published", ownerSubject: "instructor", createdAt: "2026-01-01" });
  const enrolment = (courseId: string, organizationId = "org-a", status: "active" | "completed" = "active"): LmsEnrolmentRecord => ({ courseId, organizationId, learnerSubject: "signed-in-learner", status, enrolledAt: "2026-01-02" });

  it("does not turn available or seeded catalogue courses into personal learning", () => {
    const courses = [course("Applied AI Tools"), course("Security Analyst Academy"), course("Cloud Practitioner Track")];
    expect(enrolledLearning(courses, [])).toEqual({ courses: [], enrolments: [], unavailable: [] });
    expect(enrolledLearning(courses, [enrolment("Cloud Practitioner Track")]).courses.map(item => item.id)).toEqual(["Cloud Practitioner Track"]);
  });

  it("matches both organisation and course, retains completed enrolments, and deduplicates records", () => {
    const item = enrolment("course-a", "org-a", "completed");
    const result = enrolledLearning([course("course-a"), course("course-a", "org-b")], [item, item]);
    expect(result.courses).toEqual([course("course-a")]);
    expect(result.enrolments).toEqual([item]);
    expect(result.unavailable).toEqual([]);
  });

  it("keeps genuine enrolments with unavailable course metadata distinct from an empty account", () => {
    const missing = enrolment("unpublished-course");
    expect(enrolledLearning([course("unselected")], [missing])).toEqual({ courses: [], enrolments: [missing], unavailable: [missing] });
  });
});

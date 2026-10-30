import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getVisibleAcademyNavigation } from "../src/academy-workspace";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Phase 2 Academy LMS integration contract", () => {
  it("adds a production-backed LMS workspace to instructor and staff navigation", () => {
    expect(getVisibleAcademyNavigation(false).some(x => x.id === "lms")).toBe(true);
    expect(getVisibleAcademyNavigation(true).some(x => x.id === "lms")).toBe(true);
    const staff = read("../src/academy-workspace.tsx");
    expect(staff).toContain('<LmsWorkspace mode={isStaff ? "staff" : "instructor"} />');
    expect(read("../src/student-experience.tsx")).toContain('<LmsWorkspace mode="student" />');
  });

  it("uses authenticated endpoints and never exposes sample progress", () => {
    const client = read("../src/api.ts");
    for (const path of ['/lms/me/enrolments', '/lms/courses/', '/progress', '/enrol', '/complete']) {
      expect(client).toContain(path);
    }
    const ui = read("../src/lms-workspace.tsx");
    expect(ui).toContain("recorded lessons completed");
    expect(ui).toContain("No lessons published for this course");
    expect(ui).not.toContain("42%");
    expect(ui).not.toContain("sampleCourse");
    expect(ui).not.toContain("localStorage");
  });

  it("guards all exposed LMS routes with verified Microsoft principals", () => {
    const api = read("../api/lmsFunctions.ts");
    const domain = read("../api/lmsDomain.ts");
    expect(api).toContain("const principal = await requireUser(request)");
    expect(api).toContain('route: "lms/me/enrolments"');
    expect(api).toContain('route: "lms/courses/{courseId}/lessons"');
    expect(domain).toContain("await this.requireEnrolled(ctx, courseId)");
    expect(domain).not.toContain("return lessons;");
  });
});

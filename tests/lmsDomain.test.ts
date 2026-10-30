import { describe, expect, it } from "vitest";
import { LmsService, type LmsContext, type LmsStore } from "../api/lmsDomain.js";

const memoryStore = (): LmsStore => {
  const data = new Map<string, unknown>();
  return {
    async get<T>(c: string, k: string) { return (data.get(c + "/" + k) as T) ?? null; },
    async put<T>(c: string, k: string, value: T, opts?: { ifAbsent?: boolean }) {
      if (opts?.ifAbsent && data.has(c + "/" + k)) throw Error("Duplicate");
      data.set(c + "/" + k, structuredClone(value));
    },
    async list<T>(c: string, prefix: string) {
      return [...data].filter(([k]) => k.startsWith(c + "/" + prefix)).map(([,v]) => structuredClone(v) as T);
    }
  };
};
const ctx = (role: LmsContext["role"], organizationId = "org-a"): LmsContext => ({
  role, organizationId,
  principal: { subject: role, tenantId: "tenant-a", email: "", name: "", roles: role === "staff" ? ["Portal.Staff"] : [] }
});
describe("LMS domain", () => {
  it("isolates organization courses and enrolments", async () => {
    const lms = new LmsService(memoryStore());
    const course = await lms.createCourse(ctx("instructor"), { title: "Security", description: "" });
    await lms.setCourseStatus(ctx("instructor"), course.id, "review");
    await lms.setCourseStatus(ctx("staff"), course.id, "published");
    expect(await lms.listCourses(ctx("student", "org-b"))).toEqual([]);
    await expect(lms.enrol(ctx("student", "org-b"), course.id)).rejects.toThrow();
    expect((await lms.enrol(ctx("student"), course.id)).status).toBe("active");
  });
  it("requires review and staff publication", async () => {
    const lms = new LmsService(memoryStore());
    const course = await lms.createCourse(ctx("instructor"), { title: "API", description: "" });
    await expect(lms.setCourseStatus(ctx("instructor"), course.id, "published")).rejects.toThrow();
    await expect(lms.setCourseStatus(ctx("staff"), course.id, "published")).rejects.toThrow();
    await lms.setCourseStatus(ctx("instructor"), course.id, "review");
    await lms.setCourseStatus(ctx("staff"), course.id, "published");
    expect(await lms.listCourses(ctx("student"))).toHaveLength(1);
  });
  it("requires enrolment for lesson progress", async () => {
    const lms = new LmsService(memoryStore());
    const course = await lms.createCourse(ctx("instructor"), { title: "Azure", description: "" });
    const lesson = await lms.addLesson(ctx("instructor"), course.id, { title: "PDF", mediaType: "pdf", mimeType: "application/pdf", blobKey: "org-a/lesson.pdf" });
    await expect(lms.completeLesson(ctx("student"), course.id, lesson.id)).rejects.toThrow();
    await lms.setCourseStatus(ctx("instructor"), course.id, "review");
    await lms.setCourseStatus(ctx("staff"), course.id, "published");
    await lms.enrol(ctx("student"), course.id);
    await lms.completeLesson(ctx("student"), course.id, lesson.id);
    expect((await lms.myProgress(ctx("student"), course.id))?.completedLessonIds).toEqual([lesson.id]);
  });
});

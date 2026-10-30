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
  it("lists only the signed-in learner's enrolments in the correct organisation", async () => {
    const lms = new LmsService(memoryStore());
    const author = ctx("instructor");
    const c = await lms.createCourse(author, { title: "Academy Networks", description: "" });
    await lms.setCourseStatus(author, c.id, "review");
    await lms.setCourseStatus(ctx("staff"), c.id, "published");
    await lms.enrol(ctx("student"), c.id);
    const otherLearner: LmsContext = { ...ctx("student"), principal: { ...ctx("student").principal, subject: "other-student" } };
    expect((await lms.myEnrolments(ctx("student"))).map(row => row.courseId)).toEqual([c.id]);
    expect(await lms.myEnrolments(otherLearner)).toEqual([]);
    expect(await lms.myEnrolments(ctx("student", "org-b"))).toEqual([]);
    await expect(lms.myEnrolments(ctx("instructor"))).rejects.toThrow();
  });

  it("reveals no protected lesson keys, blocks unenrolled learners and instructor peers", async () => {
    const lms = new LmsService(memoryStore());
    const author = ctx("instructor");
    const course = await lms.createCourse(author, { title: "Private labs", description: "" });
    const lesson = await lms.addLesson(author, course.id, { title: "Secure PDF", mediaType: "pdf", mimeType: "application/pdf", blobKey: "org-a/private/secret.pdf" });
    await lms.setCourseStatus(author, course.id, "review");
    await lms.setCourseStatus(ctx("staff"), course.id, "published");
    await expect(lms.listLessons(ctx("student"), course.id)).rejects.toThrow();
    const otherInstructor: LmsContext = { ...ctx("instructor"), principal: { ...ctx("instructor").principal, subject: "different-instructor" } };
    await expect(lms.listLessons(otherInstructor, course.id)).rejects.toThrow();
    await lms.enrol(ctx("student"), course.id);
    const metadata = await lms.listLessons(ctx("student"), course.id);
    expect(metadata).toEqual([{ id: lesson.id, title: "Secure PDF", mediaType: "pdf" }]);
    expect(JSON.stringify(metadata)).not.toContain("blobKey");
    expect(JSON.stringify(metadata)).not.toContain("secret.pdf");
    expect((await lms.listLessons(ctx("staff"), course.id))).toEqual(metadata);
    await expect(lms.listLessons(ctx("student", "org-b"), course.id)).rejects.toThrow();
  });

});

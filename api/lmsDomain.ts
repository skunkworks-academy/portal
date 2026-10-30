import { randomUUID } from "node:crypto";
import { HttpError } from "./http.js";
import type { Principal } from "./auth.js";

/** Durable repository implementation is injected by the host; no in-memory production fallback. */
export interface LmsStore {
  get<T>(collection: string, key: string): Promise<T | null>;
  put<T>(collection: string, key: string, value: T, options?: { ifAbsent?: boolean }): Promise<void>;
  list<T>(collection: string, prefix: string): Promise<T[]>;
}
export type LmsRole = "student" | "instructor" | "staff" | "customer-admin";
export interface LmsContext { principal: Principal; organizationId: string; role: LmsRole; }
export interface LmsCourse {
  id: string; organizationId: string; title: string; description: string;
  status: "draft" | "review" | "published"; ownerSubject: string; createdAt: string;
}
export interface LmsLesson {
  id: string; courseId: string; organizationId: string; title: string;
  mediaType: "video" | "pdf"; blobKey: string; mimeType: string;
}
export interface LmsQuestion { id: string; prompt: string; options: string[]; correctOption: number; }
export interface LmsAssessment { id: string; organizationId: string; courseId: string; questions: LmsQuestion[]; passPercent: number; }
export interface LmsEnrolment { organizationId: string; courseId: string; learnerSubject: string; status: "active" | "completed"; enrolledAt: string; }
export interface LmsProgress { organizationId: string; courseId: string; learnerSubject: string; completedLessonIds: string[]; attempts: Array<{ assessmentId: string; percent: number; passed: boolean; at: string }>; }

const safeId = (s: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(s);
function id(s: string) { if (!safeId(s)) throw new HttpError(400, "Invalid resource identifier."); return s; }
function scope(ctx: LmsContext) {
  if (!ctx.principal.subject || !ctx.principal.tenantId || !safeId(ctx.organizationId)) throw new HttpError(403, "Verified identity and organization required.");
  return ctx.organizationId;
}
function requireRole(ctx: LmsContext, allowed: LmsRole[]) {
  scope(ctx);
  if (!allowed.includes(ctx.role)) throw new HttpError(403, "Insufficient LMS permissions.");
  if (ctx.role === "staff" && !ctx.principal.roles.some(r => ["Portal.Admin", "Portal.Staff"].includes(r))) throw new HttpError(403, "Staff role must be assigned by Entra.");
}
function key(org: string, ...parts: string[]) { return [id(org), ...parts.map(id)].join(":"); }
function requireCourseOrg(course: LmsCourse | null, org: string): asserts course is LmsCourse {
  if (!course || course.organizationId !== org) throw new HttpError(404, "Course not found.");
}
export class LmsService {
  constructor(private readonly store: LmsStore) {}
  async createCourse(ctx: LmsContext, input: { title: string; description: string }) {
    requireRole(ctx, ["instructor", "staff", "customer-admin"]);
    const title = input.title?.trim();
    if (!title || title.length > 200 || (input.description?.length ?? 0) > 5000) throw new HttpError(400, "Invalid course.");
    const course: LmsCourse = { id: randomUUID(), organizationId: ctx.organizationId, title, description: input.description ?? "", status: "draft", ownerSubject: ctx.principal.subject, createdAt: new Date().toISOString() };
    await this.store.put("lmsCourses", key(ctx.organizationId, course.id), course, { ifAbsent: true });
    return course;
  }
  async listCourses(ctx: LmsContext) {
    const org = scope(ctx);
    const courses = await this.store.list<LmsCourse>("lmsCourses", org + ":");
    return courses.filter(c => c.organizationId === org && (c.status === "published" || ctx.role === "staff" || (ctx.role === "instructor" && c.ownerSubject === ctx.principal.subject) || ctx.role === "customer-admin"));
  }
  async setCourseStatus(ctx: LmsContext, courseId: string, status: "review" | "published") {
    requireRole(ctx, status === "published" ? ["staff"] : ["staff", "instructor", "customer-admin"]);
    const k = key(ctx.organizationId, courseId);
    const course = await this.store.get<LmsCourse>("lmsCourses", k);
    requireCourseOrg(course, ctx.organizationId);
    if (status === "review" && ctx.role === "instructor" && course.ownerSubject !== ctx.principal.subject) throw new HttpError(403, "Not course owner.");
    if (status === "published" && course.status !== "review") throw new HttpError(409, "Course must be reviewed before publication.");
    const next = { ...course, status };
    await this.store.put("lmsCourses", k, next);
    return next;
  }
  async addLesson(ctx: LmsContext, courseId: string, input: { title: string; mediaType: "video" | "pdf"; blobKey: string; mimeType: string }) {
    requireRole(ctx, ["staff", "instructor", "customer-admin"]);
    const course = await this.store.get<LmsCourse>("lmsCourses", key(ctx.organizationId, courseId));
    requireCourseOrg(course, ctx.organizationId);
    if (course.status !== "draft") throw new HttpError(409, "Edit draft courses only.");
    if (ctx.role === "instructor" && course.ownerSubject !== ctx.principal.subject) throw new HttpError(403, "Not course owner.");
    const mime = input.mediaType === "pdf" ? "application/pdf" : "video/mp4";
    if (input.mimeType !== mime || !input.title?.trim() || input.title.length > 200 || !input.blobKey?.startsWith(ctx.organizationId + "/") || input.blobKey.includes("..")) throw new HttpError(400, "Invalid media metadata.");
    const lesson: LmsLesson = { id: randomUUID(), courseId, organizationId: ctx.organizationId, ...input };
    await this.store.put("lmsLessons", key(ctx.organizationId, courseId, lesson.id), lesson, { ifAbsent: true });
    return lesson;
  }
  async enrol(ctx: LmsContext, courseId: string) {
    requireRole(ctx, ["student"]);
    const course = await this.store.get<LmsCourse>("lmsCourses", key(ctx.organizationId, courseId));
    requireCourseOrg(course, ctx.organizationId);
    if (course.status !== "published") throw new HttpError(403, "Course not published.");
    const k = key(ctx.organizationId, courseId, ctx.principal.subject);
    const existing = await this.store.get<LmsEnrolment>("lmsEnrolments", k);
    if (existing) return existing;
    const record: LmsEnrolment = { organizationId: ctx.organizationId, courseId, learnerSubject: ctx.principal.subject, status: "active", enrolledAt: new Date().toISOString() };
    await this.store.put("lmsEnrolments", k, record, { ifAbsent: true });
    return record;
  }
  private async requireEnrolled(ctx: LmsContext, courseId: string) {
    scope(ctx);
    const enrolled = await this.store.get<LmsEnrolment>("lmsEnrolments", key(ctx.organizationId, courseId, ctx.principal.subject));
    if (!enrolled || enrolled.organizationId !== ctx.organizationId || enrolled.learnerSubject !== ctx.principal.subject || !["active", "completed"].includes(enrolled.status)) throw new HttpError(403, "Active enrolment required.");
  }
  async completeLesson(ctx: LmsContext, courseId: string, lessonId: string) {
    await this.requireEnrolled(ctx, courseId);
    const lesson = await this.store.get<LmsLesson>("lmsLessons", key(ctx.organizationId, courseId, lessonId));
    if (!lesson || lesson.organizationId !== ctx.organizationId || lesson.courseId !== courseId) throw new HttpError(404, "Lesson not found.");
    const k = key(ctx.organizationId, courseId, ctx.principal.subject);
    const existing = await this.store.get<LmsProgress>("lmsProgress", k);
    const progress: LmsProgress = existing ?? { organizationId: ctx.organizationId, courseId, learnerSubject: ctx.principal.subject, completedLessonIds: [], attempts: [] };
    if (!progress.completedLessonIds.includes(lessonId)) progress.completedLessonIds.push(lessonId);
    await this.store.put("lmsProgress", k, progress);
    return progress;
  }
  async submitAssessment(ctx: LmsContext, courseId: string, assessmentId: string, answers: Record<string, number>) {
    await this.requireEnrolled(ctx, courseId);
    const assessment = await this.store.get<LmsAssessment>("lmsAssessments", key(ctx.organizationId, courseId, assessmentId));
    if (!assessment || assessment.organizationId !== ctx.organizationId || assessment.courseId !== courseId || !assessment.questions.length) throw new HttpError(404, "Assessment not found.");
    const correct = assessment.questions.filter(q => Number.isInteger(answers[q.id]) && answers[q.id] === q.correctOption).length;
    const percent = Math.round(correct / assessment.questions.length * 100);
    const k = key(ctx.organizationId, courseId, ctx.principal.subject);
    const progress: LmsProgress = await this.store.get<LmsProgress>("lmsProgress", k) ?? { organizationId: ctx.organizationId, courseId, learnerSubject: ctx.principal.subject, completedLessonIds: [], attempts: [] };
    const result = { assessmentId, percent, passed: percent >= assessment.passPercent, at: new Date().toISOString() };
    progress.attempts.push(result);
    await this.store.put("lmsProgress", k, progress);
    return result; // Never expose answer keys to learners.
  }
  async myProgress(ctx: LmsContext, courseId: string) {
    await this.requireEnrolled(ctx, courseId);
    return await this.store.get<LmsProgress>("lmsProgress", key(ctx.organizationId, courseId, ctx.principal.subject));
  }
}

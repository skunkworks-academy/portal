import { randomUUID } from "node:crypto";
import { HttpError } from "./http.js";
import { LmsService, type LmsContext, type LmsStore } from "./lmsDomain.js";
import type { SkunkieLearnerProfile } from "../src/learner-assessment/model.js";
import type { CurriculumBinding, LearningOutcome, LearningSession, SkunkieContext } from "../src/skunkie/contracts.js";
import { gradeActivity, gradeNetworking, networkingActivity, networkingQuestions, networkSkills } from "./skunkieNetworking.js";

export const specialistRegistry = {
  networking: { version: 1, status: "implemented", inputModes: ["text"], tools: [],
    questions: networkingQuestions, assess: gradeNetworking, buildActivity: networkingActivity, evaluate: gradeActivity },
  cybersecurity: { status: "planned" }, cloud: { status: "planned" },
  "artificial-intelligence": { status: "planned" }, ibm: { status: "planned" }, microsoft: { status: "planned" }
} as const;
const collections = { bindings: "skunkieCurriculum-v1", sessions: "skunkieSessions-v1", outcomes: "skunkieOutcomes-v1" };
const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(value);

/** The API chooses identity and curriculum. Browser-supplied context is never authoritative. */
export class SkunkieOrchestrationService {
  private lms: LmsService;
  constructor(private store: LmsStore) { this.lms = new LmsService(store); }
  private prefix(ctx: LmsContext) {
    if (ctx.role !== "student" || !ctx.principal.tenantId || !safeId(ctx.organizationId) || !safeId(ctx.principal.subject)) throw new HttpError(403, "Provisioned Academy learner required.");
    return `${ctx.organizationId}:${ctx.principal.subject}:`;
  }
  async context(ctx: LmsContext): Promise<SkunkieContext> {
    const prefix = this.prefix(ctx);
    const [enrolments, courses, bindings, sessions, outcomes] = await Promise.all([
      this.lms.myEnrolments(ctx), this.lms.listCourses(ctx),
      this.store.list<CurriculumBinding>(collections.bindings, ctx.organizationId + ":"),
      this.store.list<LearningSession>(collections.sessions, prefix),
      this.store.list<LearningOutcome>(collections.outcomes, prefix)
    ]);
    const eligible = courses.flatMap(course => {
      const binding = bindings.find(b => b.courseId === course.id && b.companionId === "networking" && b.version === 1);
      return binding && course.status === "published" && enrolments.some(e => e.courseId === course.id)
        ? [{ id: course.id, title: course.title, binding }] : [];
    });
    const ids = new Set(eligible.map(c => c.id));
    const accessibleSessions = sessions.filter(s => ids.has(s.courseId)).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    const sessionIds = new Set(accessibleSessions.map(s => s.id));
    return { learner: { name: ctx.principal.name }, courses: eligible, questions: networkingQuestions(),
      sessions: accessibleSessions, outcomes: outcomes.filter(o => sessionIds.has(o.sessionId)).sort((a,b) => b.at.localeCompare(a.at)), inputModes: ["text"] };
  }
  async bindCurriculum(ctx: LmsContext, courseId: string, input: unknown) {
    if (ctx.role !== "staff" || !ctx.principal.roles.some(r => ["Portal.Staff", "Portal.Admin"].includes(r))) throw new HttpError(403, "Academy staff required.");
    const course = (await this.lms.listCourses(ctx)).find(c => c.id === courseId && c.status === "published");
    if (!course) throw new HttpError(404, "Published course required.");
    const p = input as Partial<CurriculumBinding> | null;
    if (!p || p.companionId !== "networking" || p.catalogueTitle !== "Networking Basics" || p.version !== 1 || !p.lessonIds ||
      networkSkills.some(skill => typeof p.lessonIds?.[skill] !== "string")) throw new HttpError(400, "Map all Networking Basics skills to published lesson IDs.");
    const lessons = await this.lms.listLessons(ctx, courseId);
    if (networkSkills.some(skill => !lessons.some(l => l.id === p.lessonIds![skill]))) throw new HttpError(400, "Every mapped lesson must belong to this course.");
    const binding: CurriculumBinding = { courseId, companionId: "networking", catalogueTitle: "Networking Basics", version: 1, lessonIds: Object.fromEntries(networkSkills.map(skill => [skill, p.lessonIds![skill]])) as CurriculumBinding["lessonIds"] };
    await this.store.put(collections.bindings, `${ctx.organizationId}:${courseId}`, binding);
    return binding;
  }
  async assess(ctx: LmsContext, input: unknown) {
    const prefix = this.prefix(ctx);
    const p = input as { courseId?: string; goal?: string; answers?: unknown; consentToStore?: boolean } | null;
    if (!p || p.consentToStore !== true || typeof p.goal !== "string" || !p.goal.trim() || p.goal.length > 1000) throw new HttpError(400, "A learning goal and permission to save your assessment are required.");
    const context = await this.context(ctx);
    const course = context.courses.find(c => c.id === p.courseId);
    if (!course) throw new HttpError(403, "Active enrolment in a mapped Networking course required.");
    const lessons = await this.lms.listLessons(ctx, course.id); // Recheck publication and access.
    if (networkSkills.some(skill => !lessons.some(l => l.id === course.binding.lessonIds[skill]))) throw new HttpError(409, "Curriculum mapping needs staff review.");
    const specialist = specialistRegistry[course.binding.companionId];
    let assessment;
    try { assessment = specialist.assess(p.answers); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const profile = await this.store.get<SkunkieLearnerProfile>("skunkie-assessment-v1", `${ctx.organizationId}:${ctx.principal.subject}`);
    const progress = await this.lms.myProgress(ctx, course.id);
    const preferences = profile?.assessment;
    const history = context.sessions.filter(s => s.courseId === course.id);
    const outcomes = context.outcomes;
    // Remediate the first demonstrated gap; rotate practice after successful checks.
    const gaps = networkSkills.filter(skill => !assessment.skillResults[skill]);
    const candidates = gaps.length ? gaps : networkSkills;
    const skill = candidates.find(candidate => !history.some(s => s.activity.skill === candidate && outcomes.some(o => o.sessionId === s.id && o.correct))) ?? candidates[0];
    const approach = preferences?.preferredApproaches[0] ?? "examples";
    const session: LearningSession = {
      schemaVersion: 1, curriculum: course.binding,
      id: randomUUID(), courseId: course.id, createdAt: new Date().toISOString(), goal: p.goal.trim(), assessment,
      activity: specialist.buildActivity(skill, course.binding.lessonIds[skill], preferences?.preferredSessionMinutes ?? 15, approach),
      context: { profileUpdatedAt: profile?.updatedAt ?? null, completedLessonCount: progress?.completedLessonIds.length ?? 0, priorOutcomeCount: outcomes.length, approach }
    };
    await this.store.put(collections.sessions, prefix + session.id, session, { ifAbsent: true });
    return session;
  }
  async evaluate(ctx: LmsContext, sessionId: string, input: unknown) {
    const prefix = this.prefix(ctx);
    if (!safeId(sessionId)) throw new HttpError(400, "Invalid session.");
    const session = await this.store.get<LearningSession>(collections.sessions, prefix + sessionId);
    if (!session) throw new HttpError(404, "Learning session not found.");
    const current = await this.context(ctx);
    if (!current.courses.some(c => c.id === session.courseId)) throw new HttpError(403, "Course access is no longer active.");
    const p = input as { answer?: unknown } | null;
    let correct;
    try { correct = specialistRegistry[session.curriculum.companionId].evaluate(session.activity.skill, p?.answer); } catch (error) { throw new HttpError(400, (error as Error).message); }
    // First submission per session wins, including retries. Immutable records avoid lost updates.
    const existing = await this.store.get<LearningOutcome>(collections.outcomes, prefix + sessionId);
    if (existing) return existing;
    const outcome: LearningOutcome = { id: sessionId, sessionId, at: new Date().toISOString(), correct,
      nextStep: correct ? "Practice check demonstrated. Continue with your mapped Academy lesson or start another diagnostic." : "Review the explanation and mapped Academy lesson, then start another diagnostic for more practice." };
    try { await this.store.put(collections.outcomes, prefix + sessionId, outcome, { ifAbsent: true }); }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
      const winner = await this.store.get<LearningOutcome>(collections.outcomes, prefix + sessionId);
      if (!winner) throw error;
      return winner;
    }
    return outcome;
  }
}

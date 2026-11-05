import { describe, expect, it } from "vitest";
import { SkunkieOrchestrationService } from "../api/skunkieOrchestration.js";
import { networkingQuestions } from "../api/skunkieNetworking.js";
import { HttpError } from "../api/http.js";
import type { LmsContext, LmsStore } from "../api/lmsDomain.js";

const student = (subject = "learner-a", organizationId = "academy"): LmsContext => ({ organizationId, role: "student", principal: { subject, tenantId: "tenant", name: "Test learner", email: "synthetic@example.invalid", roles: [] } });
const staff: LmsContext = { ...student("staff"), role: "staff", principal: { ...student("staff").principal, roles: ["Portal.Staff"] } };
const answers = { "net-address-v1": 1, "net-switch-v1": 0, "net-trouble-v1": 2 };
const binding = { companionId: "networking", catalogueTitle: "Networking Basics", version: 1, lessonIds: { addressing: "lesson-a", switching: "lesson-s", troubleshooting: "lesson-t" } };
async function setup() {
  const records = new Map<string, unknown>();
  const store: LmsStore = {
    async get<T>(c: string, k: string) { return structuredClone(records.get(c + "/" + k) as T ?? null); },
    async put(c, k, value, options) {
      if (options?.ifAbsent && records.has(c + "/" + k)) throw new HttpError(409, "Conflict");
      records.set(c + "/" + k, structuredClone(value));
    },
    async list<T>(c: string, prefix: string) { return [...records].filter(([key]) => key.startsWith(c + "/" + prefix)).map(([,value]) => structuredClone(value) as T); }
  };
  await store.put("lmsCourses", "academy:networking", { id: "networking", organizationId: "academy", title: "Networking Basics", status: "published", ownerSubject: "staff" });
  for (const id of Object.values(binding.lessonIds)) await store.put("lmsLessons", `academy:networking:${id}`, { id, courseId: "networking", organizationId: "academy", title: id, mediaType: "pdf", blobKey: "academy/private.pdf" });
  await store.put("lmsEnrolments", "academy:networking:learner-a", { organizationId: "academy", courseId: "networking", learnerSubject: "learner-a", status: "active" });
  const service = new SkunkieOrchestrationService(store);
  await service.bindCurriculum(staff, "networking", binding);
  return { store, service, records };
}
const request = (overrides = {}) => ({ courseId: "networking", goal: "Learn networking", answers, consentToStore: true, ...overrides });

describe("Skunkie Networking vertical slice", () => {
  it("aggregates actual enrolment and never returns private storage or answer keys", async () => {
    const { service } = await setup();
    const context = await service.context(student());
    expect(context.courses.map(c => c.id)).toEqual(["networking"]);
    expect(context.questions).toHaveLength(3);
    expect(JSON.stringify(context)).not.toMatch(/correctOption|blobKey|private.pdf|\"answer\"/);
    expect((await service.context(student("learner-b"))).courses).toEqual([]);
    expect((await service.context(student("learner-a", "another-org"))).courses).toEqual([]);
  });
  it("uses demonstrated gaps and saved preferences, records sessions and reloads them", async () => {
    const { store, service } = await setup();
    await store.put("skunkie-assessment-v1", "academy:learner-a", { updatedAt: "2026-11-05T00:00:00Z", assessment: { preferredSessionMinutes: 30, preferredApproaches: ["hands_on"] } });
    const session = await service.assess(student(), request({ answers: { ...answers, "net-switch-v1": 2 } }));
    expect(session.assessment.percent).toBe(67);
    expect(session.activity.skill).toBe("switching");
    expect(session.activity.lessonId).toBe("lesson-s");
    expect(session.activity.minutes).toBe(30);
    expect(session.context.approach).toBe("hands_on");
    const reopened = await new SkunkieOrchestrationService(store).context(student());
    expect(reopened.sessions).toEqual([session]);
    expect((await service.context(student("learner-b"))).sessions).toEqual([]);
  });
  it("records a server-evaluated first outcome, retries safely and adapts subsequent practice", async () => {
    const { service, records } = await setup();
    const session = await service.assess(student(), request());
    expect(session.activity.skill).toBe("addressing");
    const outcome = await service.evaluate(student(), session.id, { answer: 1, correct: false, percent: 0 });
    expect(outcome.correct).toBe(true);
    expect(await service.evaluate(student(), session.id, { answer: 0 })).toEqual(outcome);
    const next = await service.assess(student(), request());
    expect(next.activity.skill).toBe("switching");
    expect(next.context.priorOutcomeCount).toBe(1);
    expect([...records.keys()].filter(k => k.startsWith("lmsProgress/"))).toHaveLength(0);
  });
  it("retains unsuccessful practice and recommends remediation", async () => {
    const { service } = await setup();
    const session = await service.assess(student(), request());
    const outcome = await service.evaluate(student(), session.id, { answer: 0 });
    expect(outcome.correct).toBe(false);
    expect(outcome.nextStep).toContain("Review");
    expect((await service.assess(student(), request())).activity.skill).toBe("addressing");
  });
  it("does not let another learner evaluate or retrieve a session", async () => {
    const { service } = await setup();
    const session = await service.assess(student(), request());
    await expect(service.evaluate(student("learner-b"), session.id, { answer: 1 })).rejects.toMatchObject({ status: 404 });
  });
  it("blocks revoked enrolments, unpublished courses and missing mappings", async () => {
    const { store, service, records } = await setup();
    const session = await service.assess(student(), request());
    await store.put("lmsEnrolments", "academy:networking:learner-a", { organizationId: "academy", courseId: "networking", learnerSubject: "learner-a", status: "suspended" });
    await expect(service.assess(student(), request())).rejects.toMatchObject({ status: 403 });
    await expect(service.evaluate(student(), session.id, { answer: 1 })).rejects.toMatchObject({ status: 403 });
    records.delete("skunkieCurriculum-v1/academy:networking");
    expect((await service.context(student())).courses).toHaveLength(0);
    await store.put("lmsCourses", "academy:networking", { id: "networking", organizationId: "academy", status: "draft" });
    await expect(service.bindCurriculum(staff, "networking", binding)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects consent omissions, malformed answers and invalid evaluations", async () => {
    const { service } = await setup();
    for (const input of [null, request({ goal: "" }), request({ consentToStore: false }), request({ answers: {} }), request({ answers: { ...answers, forged: 100 } }), request({ answers: { ...answers, "net-switch-v1": "0" } })]) {
      await expect(service.assess(student(), input)).rejects.toMatchObject({ status: 400 });
    }
    const session = await service.assess(student(), request());
    await expect(service.evaluate(student(), session.id, { answer: 90 })).rejects.toMatchObject({ status: 400 });
    await expect(service.evaluate(student(), "../other", { answer: 1 })).rejects.toMatchObject({ status: 400 });
  });
  it("requires staff to bind real course lessons and rejects a cross-course lesson", async () => {
    const { service } = await setup();
    await expect(service.bindCurriculum(student(), "networking", binding)).rejects.toMatchObject({ status: 403 });
    await expect(service.bindCurriculum({ ...staff, principal: { ...staff.principal, roles: [] } }, "networking", binding)).rejects.toMatchObject({ status: 403 });
    await expect(service.bindCurriculum(staff, "networking", { ...binding, lessonIds: { ...binding.lessonIds, addressing: "private-other-course" } })).rejects.toMatchObject({ status: 400 });
  });
  it("fails closed when the database fails and keeps answer keys server-side", async () => {
    const { store } = await setup();
    const broken = new SkunkieOrchestrationService({ ...store, list: async () => { throw Error("Database down"); } });
    await expect(broken.context(student())).rejects.toThrow("Database down");
    expect(networkingQuestions().every(q => !("answer" in q))).toBe(true);
  });
});

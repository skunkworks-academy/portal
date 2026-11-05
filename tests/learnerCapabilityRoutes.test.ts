import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequest, type HttpResponseInit } from "@azure/functions";
import { HttpError } from "../api/http.js";
import { config } from "../api/config.js";

const mocks = vi.hoisted(() => ({
  routes: new Map<string, { handler(request: HttpRequest): Promise<HttpResponseInit> }>(),
  user: vi.fn(), records: new Map<string, unknown>(), reads: vi.fn()
}));
vi.mock("@azure/functions", async original => ({ ...await original<typeof import("@azure/functions")>(), app: { http: (name: string, route: never) => mocks.routes.set(name, route) } }));
vi.mock("../api/auth.js", async original => ({ ...await original<typeof import("../api/auth.js")>(), requireUser: mocks.user }));
vi.mock("../api/lmsCosmosStore.js", () => ({ CosmosLmsStore: class {
  async get(c: string, k: string) { mocks.reads(); return structuredClone(mocks.records.get(`${c}/${k}`) ?? null); }
  async put(c: string, k: string, value: unknown, options?: { ifAbsent?: boolean }) {
    if (options?.ifAbsent && mocks.records.has(`${c}/${k}`)) throw new HttpError(409, "Conflict");
    mocks.records.set(`${c}/${k}`, structuredClone(value));
  }
  async list(c: string, prefix: string) { mocks.reads(); return [...mocks.records].filter(([k]) => k.startsWith(`${c}/${prefix}`)).map(([, v]) => structuredClone(v)); }
} }));
await import("../api/lmsFunctions.js");
await import("../api/skunkieOrchestrationFunctions.js");

const home = config.entraTenantId;
const binding = { courseId: "networking", companionId: "networking", catalogueTitle: "Networking Basics", version: 1, lessonIds: { addressing: "lesson-a", switching: "lesson-s", troubleshooting: "lesson-t" } };
const practice = { courseId: "networking", goal: "Learn networking", consentToStore: true, answers: { "net-address-v1": 1, "net-switch-v1": 0, "net-trouble-v1": 2 } };
const learnerRoutes = ["lmsMyCoursesList", "lmsMyEnrolments", "lmsMyCourseLessons", "lmsEnrol", "lmsLessonComplete", "lmsAssessmentSubmit", "lmsMyProgress", "skunkieLearningContext", "skunkieNetworkingAssess", "skunkieActivityEvaluate"];
function user(roles: string[], subject = "learner-a", tenantId = home) { return { subject, tenantId, roles, name: "Synthetic", email: "synthetic@example.invalid" }; }
function call(name: string, body: unknown = {}, params = { courseId: "networking", lessonId: "lesson-a", assessmentId: "quiz", sessionId: "session" }) {
  return mocks.routes.get(name)!.handler(new HttpRequest({ url: "https://example.invalid/api/?mode=student&workspaceRole=Student", method: "POST", params, headers: { origin: "http://localhost:5173" }, body: { string: JSON.stringify(body) } }));
}
function data(response: HttpResponseInit): any { return response.jsonBody; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.records.clear();
  vi.stubEnv("ENTRA_TENANT_ID", home); vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "academy");
  vi.stubEnv("LMS_COSMOS_ENDPOINT", "https://example.invalid"); vi.stubEnv("LMS_COSMOS_DATABASE", "test"); vi.stubEnv("LMS_COSMOS_CONTAINER", "test");
  mocks.user.mockResolvedValue(user([]));
  mocks.records.set("lmsCourses/academy:networking", { id: "networking", organizationId: "academy", title: "Networking Basics", status: "published", ownerSubject: "instructor-other" });
  mocks.records.set("lmsCourses/academy:draft", { id: "draft", organizationId: "academy", title: "Unpublished", status: "draft", ownerSubject: "instructor-other" });
  for (const id of Object.values(binding.lessonIds)) mocks.records.set(`lmsLessons/academy:networking:${id}`, { id, courseId: "networking", organizationId: "academy", title: id, mediaType: "pdf", blobKey: "academy/private.pdf" });
  mocks.records.set("lmsAssessments/academy:networking:quiz", { id: "quiz", organizationId: "academy", courseId: "networking", questions: [{ id: "q", correctOption: 1 }], passPercent: 80 });
  mocks.records.set("skunkieCurriculum-v1/academy:networking", binding);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("explicit Student capability on own-learner routes", () => {
  it.each([
    ["Portal.Staff", "Portal.Student"],
    ["Portal.Instructor", "Portal.Student"],
    ["Portal.Staff", "Portal.Instructor", "Portal.Student"],
    ["Portal.Admin", "Portal.Instructor", "Portal.Student"],
    ["portal.staff", "portal.student"]
  ])("honors assigned learner capability alongside %j", async (...roles) => {
    mocks.user.mockResolvedValue(user(roles));
    expect(data(await call("lmsMyCoursesList")).map((course: any) => course.id)).toEqual(["networking"]);
    expect((await call("lmsMyCourseLessons")).status).toBe(403);
    const enrolment = await call("lmsEnrol", { learnerSubject: "forged", organizationId: "other", role: "staff" });
    expect(enrolment.status).toBe(200);
    expect(data(enrolment)).toMatchObject({ learnerSubject: "learner-a", organizationId: "academy" });
    expect(data(await call("lmsMyEnrolments"))).toHaveLength(1);
    const lessons = await call("lmsMyCourseLessons"); expect(lessons.status).toBe(200);
    expect(JSON.stringify(data(lessons))).not.toMatch(/blobKey|private.pdf/);
    expect((await call("lmsLessonComplete")).status).toBe(200);
    expect(data(await call("lmsMyProgress")).completedLessonIds).toEqual(["lesson-a"]);
    expect((await call("lmsAssessmentSubmit", { answers: { q: 1 } })).status).toBe(200);
    expect(data(await call("skunkieLearningContext")).courses).toHaveLength(1);
    const session = await call("skunkieNetworkingAssess", { ...practice, learnerSubject: "forged" });
    expect(session.status).toBe(200);
    const result = await call("skunkieActivityEvaluate", { answer: 1 }, { courseId: "networking", lessonId: "lesson-a", assessmentId: "quiz", sessionId: data(session).id });
    expect(result.status).toBe(200);
    expect([...mocks.records.keys()].filter(key => key.includes("forged"))).toEqual([]);
  });

  it.each([["Portal.Staff"], ["Portal.Instructor"], ["Portal.Admin"], ["Portal.Staff", "Portal.Instructor"]])("denies management-only claims %j despite browser mode/body", async (...roles) => {
    mocks.user.mockResolvedValue(user(roles));
    const before = [...mocks.records];
    for (const route of learnerRoutes) {
      expect((await call(route, { ...practice, workspaceRole: "Student", roles: ["Portal.Student"] })).status).toBe(403);
    }
    expect(mocks.reads).not.toHaveBeenCalled();
    expect([...mocks.records]).toEqual(before);
  });

  it("preserves existing default-student behavior", async () => {
    expect((await call("lmsCoursesList")).status).toBe(200);
    expect((await call("lmsMyCoursesList")).status).toBe(200);
    expect((await call("lmsEnrol")).status).toBe(200);
    expect((await call("lmsCourseLessons")).status).toBe(200);
    expect(data(await call("skunkieLearningContext")).courses).toHaveLength(1);
  });

  it("retains own subject, organization, enrolment and publication boundaries", async () => {
    const roles = ["Portal.Staff", "Portal.Student"];
    mocks.user.mockResolvedValue(user(roles)); await call("lmsEnrol");
    const session = data(await call("skunkieNetworkingAssess", practice));
    mocks.user.mockResolvedValue(user(roles, "learner-b"));
    expect(data(await call("lmsMyEnrolments"))).toEqual([]);
    expect((await call("lmsMyCourseLessons")).status).toBe(403);
    expect((await call("lmsMyProgress")).status).toBe(403);
    expect(data(await call("skunkieLearningContext")).sessions).toEqual([]);
    expect((await call("skunkieActivityEvaluate", { answer: 1 }, { courseId: "networking", lessonId: "lesson-a", assessmentId: "quiz", sessionId: session.id })).status).toBe(404);
    mocks.user.mockResolvedValue(user(roles)); vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "other-org");
    expect(data(await call("lmsMyCoursesList"))).toEqual([]);
    expect(data(await call("lmsMyEnrolments"))).toEqual([]);
    expect((await call("lmsEnrol")).status).toBe(404);
    expect((await call("lmsMyCourseLessons")).status).toBe(404);
    expect(data(await call("skunkieLearningContext")).courses).toEqual([]);
    vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "academy");
    const course = mocks.records.get("lmsCourses/academy:networking") as object;
    mocks.records.set("lmsCourses/academy:networking", { ...course, status: "draft" });
    expect((await call("lmsMyCourseLessons")).status).toBe(404);
    expect((await call("lmsEnrol")).status).toBe(403);
    expect((await call("skunkieNetworkingAssess", practice)).status).toBe(403);
  });

  it("keeps staff management and instructor ownership checks on management routes", async () => {
    mocks.user.mockResolvedValue(user(["Portal.Staff"]));
    expect(data(await call("lmsCoursesList"))).toHaveLength(2);
    expect((await call("lmsCourseLessons")).status).toBe(200);
    expect((await call("skunkieCurriculumBind", binding)).status).toBe(200);
    const draft = { courseId: "draft", lessonId: "", assessmentId: "", sessionId: "" };
    expect((await call("lmsCourseReview", {}, draft)).status).toBe(200);
    expect((await call("lmsCoursePublish", {}, draft)).status).toBe(200);
    mocks.user.mockResolvedValue(user(["Portal.Instructor", "Portal.Student"]));
    expect((await call("lmsCourseLessons")).status).toBe(403);
    expect((await call("lmsCoursePublish", {}, draft)).status).toBe(403);
    expect((await call("skunkieCurriculumBind", binding)).status).toBe(403);
    await call("lmsEnrol"); expect((await call("lmsMyCourseLessons")).status).toBe(200);
  });

  it("authenticates and checks home-tenant membership before any storage read", async () => {
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "");
    mocks.user.mockRejectedValue(new HttpError(401, "Authentication required."));
    for (const name of mocks.routes.keys()) expect((await call(name)).status).toBe(401);
    mocks.user.mockResolvedValue(user(["Portal.Staff", "Portal.Student"], "external", "external-tenant"));
    for (const name of mocks.routes.keys()) expect((await call(name)).status).toBe(403);
    expect(mocks.reads).not.toHaveBeenCalled();
  });

  it("reports missing storage for an authorized learner without inventing records", async () => {
    mocks.user.mockResolvedValue(user(["Portal.Staff", "Portal.Student"]));
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "");
    for (const route of learnerRoutes) expect((await call(route)).status).toBe(503);
    expect(mocks.reads).not.toHaveBeenCalled();
  });
});

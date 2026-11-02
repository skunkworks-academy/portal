import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest } from "@azure/functions";
import { requireUser, hasPortalRole } from "./auth.js";
import { failure, json, readJson, HttpError } from "./http.js";
import { LmsService, type LmsContext, type LmsRole } from "./lmsDomain.js";
import { CosmosLmsStore } from "./lmsCosmosStore.js";

const credential = new DefaultAzureCredential();
function service() {
  const endpoint = process.env.LMS_COSMOS_ENDPOINT;
  const database = process.env.LMS_COSMOS_DATABASE;
  const container = process.env.LMS_COSMOS_CONTAINER;
  if (!endpoint || !database || !container) throw new HttpError(503, "LMS storage is not configured.");
  return new LmsService(new CosmosLmsStore(endpoint, database, container, async () =>
    (await credential.getToken("https://cosmos.azure.com/.default")).token));
}
async function context(request: HttpRequest): Promise<LmsContext> {
  const principal = await requireUser(request);
  // Fail closed: only home-tenant users are provisioned until organization membership is verified.
  const home = process.env.ENTRA_TENANT_ID ?? "338a8916-80d9-467c-a94a-7f61d04ef7d5";
  if (principal.tenantId?.toLowerCase() !== home.toLowerCase()) throw new HttpError(403, "LMS organization membership not provisioned.");
  const organizationId = process.env.LMS_HOME_ORGANIZATION_ID;
  if (!organizationId) throw new HttpError(503, "LMS organization is not configured.");
  let role: LmsRole = "student";
  if (hasPortalRole(principal, ["Portal.Staff", "Portal.Admin"])) role = "staff";
  else if (hasPortalRole(principal, ["Portal.Instructor"])) role = "instructor";
  return { principal, organizationId, role };
}
async function handle(request: HttpRequest, fn: (lms: LmsService, ctx: LmsContext) => Promise<unknown>) {
  try {
    const ctx = await context(request);
    return json(request, await fn(service(), ctx));
  }
  catch (error) { return failure(request, error); }
}
app.http("lmsCoursesList", { methods: ["GET"], authLevel: "anonymous", route: "lms/courses",
  handler: request => handle(request, async (lms, ctx) => lms.listCourses(ctx)) });
app.http("lmsMyEnrolments", { methods: ["GET"], authLevel: "anonymous", route: "lms/me/enrolments",
  handler: request => handle(request, async (lms, ctx) => lms.myEnrolments(ctx)) });
app.http("lmsCourseLessons", { methods: ["GET"], authLevel: "anonymous", route: "lms/courses/{courseId}/lessons",
  handler: request => handle(request, async (lms, ctx) => lms.listLessons(ctx, request.params.courseId)) });
app.http("lmsCoursesCreate", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses",
  handler: request => handle(request, async (lms, ctx) => lms.createCourse(ctx, await readJson<{title:string;description:string}>(request))) });
app.http("lmsCourseReview", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses/{courseId}/review",
  handler: request => handle(request, async (lms, ctx) => lms.setCourseStatus(ctx, request.params.courseId, "review")) });
app.http("lmsCoursePublish", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses/{courseId}/publish",
  handler: request => handle(request, async (lms, ctx) => lms.setCourseStatus(ctx, request.params.courseId, "published")) });
app.http("lmsLessonCreate", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses/{courseId}/lessons",
  handler: request => handle(request, async (lms, ctx) => lms.addLesson(ctx, request.params.courseId, await readJson<{title:string;mediaType:"video"|"pdf";blobKey:string;mimeType:string}>(request))) });
app.http("lmsEnrol", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses/{courseId}/enrol",
  handler: request => handle(request, async (lms, ctx) => lms.enrol(ctx, request.params.courseId)) });
app.http("lmsLessonComplete", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses/{courseId}/lessons/{lessonId}/complete",
  handler: request => handle(request, async (lms, ctx) => lms.completeLesson(ctx, request.params.courseId, request.params.lessonId)) });
app.http("lmsAssessmentSubmit", { methods: ["POST"], authLevel: "anonymous", route: "lms/courses/{courseId}/assessments/{assessmentId}/submit",
  handler: request => handle(request, async (lms, ctx) => {
    const input = await readJson<{answers:Record<string,number>}>(request);
    return lms.submitAssessment(ctx, request.params.courseId, request.params.assessmentId, input.answers);
  }) });
app.http("lmsMyProgress", { methods: ["GET"], authLevel: "anonymous", route: "lms/courses/{courseId}/progress",
  handler: request => handle(request, async (lms, ctx) => lms.myProgress(ctx, request.params.courseId)) });

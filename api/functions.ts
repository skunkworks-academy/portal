import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { config, missingSettings } from "./config.js";
import { requireAdmin, requireInstructor, requireStudent, requireUser } from "./auth.js";
import { exchangeBulkMailApiCourse, exchangeBulkMailFinalAssessment } from "./courseContent.js";
import { requireCourseLesson, scoreFinalAssessment, validateProgressPayload, type AssessmentPayload, type CourseProgressPayload } from "./courseMiddleware.js";
import { fallbackJobs } from "./fallbackData.js";
import { empty, failure, json, readJson } from "./http.js";
import {
  createApplication,
  createClass,
  createJob,
  getAllJobs,
  getApplications,
  getClassRegistrations,
  getClasses,
  getCourses,
  getLiveJobs,
  getMyApplications,
  getMyClassRegistrations,
  getMyProfile,
  getProfiles,
  getTasks,
  registerForClass,
  updateApplication,
  updateClass,
  updateJob,
  updateTask,
  upsertMyProfile
} from "./graph.js";
import type { ApplicationRecord, ClassInput, JobInput, NewApplication, OnboardingTask, PortalProfileInput, PortalRole } from "../src/types.js";

app.http("cors", {
  methods: ["OPTIONS"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => empty(request)
});

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async (request) => json(request, {
    ok: true,
    service: "skunkworks-academy-portal-api",
    missingSettings: missingSettings([
      "entraTenantId",
      "apiClientId",
      "apiClientSecret",
      "spaClientId",
      "graphTenantId",
      "sharePointHostname",
      "sharePointSitePath"
    ]),
    allowedOrigins: config.allowedOrigins,
    routes: [
      "GET /api/health",
      "GET /api/jobs",
      "GET /api/courses",
      "GET /api/classes",
      "GET /api/courses/exchange-online-bulk-mail-management",
      "GET /api/courses/exchange-online-bulk-mail-management/lessons/{lessonId}",
      "POST /api/courses/exchange-online-bulk-mail-management/progress",
      "POST /api/courses/exchange-online-bulk-mail-management/assessments/final",
      "POST /api/classes/{id}/register",
      "POST /api/classes/{id}/assign-instructor",
      "GET /api/me/classes",
      "GET /api/me/profile",
      "PATCH /api/me/profile",
      "POST /api/applications",
      "GET /api/me/applications",
      "GET /api/admin/applications",
      "GET /api/admin/profiles",
      "GET /api/admin/class-registrations",
      "POST /api/admin/classes",
      "PATCH /api/admin/classes/{id}",
      "PATCH /api/admin/applications/{id}",
      "GET /api/admin/jobs",
      "POST /api/admin/jobs",
      "PATCH /api/admin/jobs/{id}",
      "GET /api/admin/tasks",
      "PATCH /api/admin/tasks/{id}"
    ]
  })
});

app.http("getJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "jobs",
  handler: async (request, context) => {
    try {
      return json(request, await getLiveJobs());
    } catch (error) {
      context.warn("Falling back to preset jobs because SharePoint jobs could not be loaded.", error);
      return json(request, fallbackJobs);
    }
  }
});

app.http("getCourses", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "courses",
  handler: async (request, context) => handle(request, context, async () => json(request, await getCourses()))
});

app.http("getExchangeBulkMailCourse", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "courses/exchange-online-bulk-mail-management",
  handler: async (request, context) => handle(request, context, async () => json(request, {
    ...exchangeBulkMailApiCourse,
    finalAssessment: exchangeBulkMailFinalAssessment.map(({ answer: _answer, ...question }) => question),
    completion: {
      requiredLessons: exchangeBulkMailApiCourse.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)),
      requiredAssessmentScore: exchangeBulkMailApiCourse.requiredAssessmentScore,
      badge: exchangeBulkMailApiCourse.badge
    }
  }))
});

app.http("getExchangeBulkMailLesson", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "courses/exchange-online-bulk-mail-management/lessons/{lessonId}",
  handler: async (request, context) => handle(request, context, async () => json(request, requireCourseLesson(request.params.lessonId)))
});

app.http("trackExchangeBulkMailProgress", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "courses/exchange-online-bulk-mail-management/progress",
  handler: async (request, context) => handle(request, context, async () => {
    const payload = await readJson<CourseProgressPayload>(request);
    return json(request, validateProgressPayload(payload), 202);
  })
});

app.http("submitExchangeBulkMailAssessment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "courses/exchange-online-bulk-mail-management/assessments/final",
  handler: async (request, context) => handle(request, context, async () => {
    const payload = await readJson<AssessmentPayload>(request);
    return json(request, scoreFinalAssessment(payload));
  })
});

app.http("getClasses", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "classes",
  handler: async (request, context) => handle(request, context, async () => json(request, await getClasses()))
});

app.http("registerClass", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "classes/{id}/register",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireStudent(request);
    return json(request, await registerForClass(request.params.id, principal), 201);
  })
});

app.http("assignInstructorClass", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "classes/{id}/assign-instructor",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireInstructor(request);
    return json(request, await updateClass(request.params.id, { instructor: principal.name || principal.email }, principal));
  })
});

app.http("myClasses", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/classes",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireStudent(request);
    return json(request, await getMyClassRegistrations(principal));
  })
});

app.http("myProfile", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/profile",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireUser(request);
    return json(request, await getMyProfile(principal));
  })
});

app.http("updateMyProfile", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "me/profile",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireUser(request);
    const payload = await readJson<PortalProfileInput>(request);
    return json(request, await upsertMyProfile(payload, principal));
  })
});

app.http("submitApplication", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "applications",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireInstructor(request);
    const payload = await readJson<NewApplication>(request);
    return json(request, await createApplication(payload, principal), 201);
  })
});

app.http("myApplications", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/applications",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireInstructor(request);
    return json(request, await getMyApplications(principal));
  })
});

app.http("adminApplications", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/applications",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    return json(request, await getApplications());
  })
});

app.http("adminProfiles", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/profiles",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    const role = request.query.get("role") as PortalRole | null;
    return json(request, await getProfiles(role ?? undefined));
  })
});

app.http("adminClassRegistrations", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/class-registrations",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    return json(request, await getClassRegistrations());
  })
});

app.http("adminClassCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/classes",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireAdmin(request);
    const payload = await readJson<ClassInput>(request);
    return json(request, await createClass(payload, principal), 201);
  })
});

app.http("adminClassUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "admin/classes/{id}",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireAdmin(request);
    const payload = await readJson<Partial<ClassInput>>(request);
    return json(request, await updateClass(request.params.id, payload, principal));
  })
});

app.http("adminApplicationUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "admin/applications/{id}",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireAdmin(request);
    const payload = await readJson<Partial<Pick<ApplicationRecord, "status" | "owner">>>(request);
    return json(request, await updateApplication(request.params.id, payload, principal));
  })
});

app.http("adminJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/jobs",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    return json(request, await getAllJobs());
  })
});

app.http("adminJobCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/jobs",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    const payload = await readJson<JobInput>(request);
    return json(request, await createJob(payload), 201);
  })
});

app.http("adminJobUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "admin/jobs/{id}",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    const payload = await readJson<Partial<JobInput>>(request);
    return json(request, await updateJob(request.params.id, payload));
  })
});

app.http("adminTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/tasks",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    return json(request, await getTasks());
  })
});

app.http("adminTaskUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "admin/tasks/{id}",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireAdmin(request);
    const payload = await readJson<Partial<OnboardingTask>>(request);
    return json(request, await updateTask(request.params.id, payload, principal));
  })
});

async function handle(request: HttpRequest, context: InvocationContext, action: () => Promise<ReturnType<typeof json>>) {
  try {
    return await action();
  } catch (error) {
    context.error(error);
    return failure(request, error);
  }
}

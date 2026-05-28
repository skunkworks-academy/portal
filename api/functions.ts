import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { config, missingSettings } from "./config.js";
import { requireAdmin, requireUser } from "./auth.js";
import { fallbackJobs } from "./fallbackData.js";
import { empty, failure, json, readJson } from "./http.js";
import {
  createApplication,
  createJob,
  getApplications,
  getLiveJobs,
  getMyApplications,
  getTasks,
  updateApplication,
  updateJob,
  updateTask
} from "./graph.js";
import type { ApplicationRecord, JobInput, NewApplication, OnboardingTask } from "../src/types.js";

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
    service: "skunkworks-instructor-portal-api",
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
      "POST /api/applications",
      "GET /api/me/applications",
      "GET /api/admin/applications",
      "PATCH /api/admin/applications/{id}",
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

app.http("submitApplication", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "applications",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireUser(request);
    const payload = await readJson<NewApplication>(request);
    return json(request, await createApplication(payload, principal), 201);
  })
});

app.http("myApplications", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/applications",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireUser(request);
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

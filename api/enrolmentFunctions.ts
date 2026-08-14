import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { config } from "./config.js";
import { requireAdmin, requireStudent } from "./auth.js";
import { corsHeaders, failure, HttpError, json, readJson } from "./http.js";
import {
  listAdminEnrolments,
  listAdminSubscriptions,
  listMyEnrolments,
  resolveCourseAccess,
  submitAnonymousEnrolment,
  submitAuthenticatedEnrolment,
  updateAdminEnrolment,
  type EnrolmentRequestInput
} from "./enrolmentService.js";

app.http("submitAnonymousCourseEnrolment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "enrolments/requests",
  handler: async (request, context) => handle(request, context, async () => {
    requireAllowedOrigin(request);
    const payload = await readJson<EnrolmentRequestInput>(request);
    return json(request, await submitAnonymousEnrolment(payload), 201);
  })
});

app.http("submitAuthenticatedCourseEnrolment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "enrolments",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireStudent(request);
    const payload = await readJson<EnrolmentRequestInput>(request);
    return json(request, await submitAuthenticatedEnrolment(payload, principal), 201);
  })
});

app.http("myCourseEnrolments", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/enrolments",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireStudent(request);
    return json(request, await listMyEnrolments(principal));
  })
});

app.http("courseAccess", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "course-access",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireStudent(request);
    const result = await resolveCourseAccess(request.query.get("courseId"), principal);
    return {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Content-Type": "application/json",
        "Cache-Control": "no-store, private"
      },
      jsonBody: result
    };
  })
});

app.http("staffCourseEnrolments", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "staff/enrolments",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    const records = await listAdminEnrolments({
      courseId: request.query.get("courseId") ?? undefined,
      status: request.query.get("status") ?? undefined,
      email: request.query.get("email") ?? undefined
    });
    return json(request, records);
  })
});

app.http("staffCourseEnrolmentUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "staff/enrolments/{id}",
  handler: async (request, context) => handle(request, context, async () => {
    const principal = await requireAdmin(request);
    const payload = await readJson<{
      status?: string;
      notes?: string;
      paymentTransactionId?: string;
      entitlementId?: string;
      providerReference?: string;
    }>(request);
    return json(request, await updateAdminEnrolment(request.params.id, payload, principal));
  })
});

app.http("staffSubscriptions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "staff/subscriptions",
  handler: async (request, context) => handle(request, context, async () => {
    await requireAdmin(request);
    const records = await listAdminSubscriptions({
      email: request.query.get("email") ?? undefined,
      status: request.query.get("status") ?? undefined
    });
    return json(request, records);
  })
});

function requireAllowedOrigin(request: HttpRequest) {
  const origin = (request.headers.get("origin") ?? "").replace(/\/$/, "");
  if (origin && !config.allowedOrigins.includes(origin)) {
    throw new HttpError(403, "This origin is not permitted to submit enrolment requests.");
  }
}

async function handle(
  request: HttpRequest,
  context: InvocationContext,
  action: () => Promise<HttpResponseInit>
): Promise<HttpResponseInit> {
  try {
    return await action();
  } catch (error) {
    context.error(error);
    return failure(request, error);
  }
}

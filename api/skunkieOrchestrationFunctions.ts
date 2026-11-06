import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest } from "@azure/functions";
import { requireUser, hasPortalRole } from "./auth.js";
import { CosmosLmsStore } from "./lmsCosmosStore.js";
import type { LmsContext } from "./lmsDomain.js";
import { SkunkieOrchestrationService } from "./skunkieOrchestration.js";
import { failure, HttpError, json, readJson } from "./http.js";
import { ownLearnerContext } from "./learnerCapability.js";

const credential = new DefaultAzureCredential();
export async function skunkieRequestContext(request: HttpRequest) {
  const principal = await requireUser(request);
  const home = process.env.ENTRA_TENANT_ID ?? "338a8916-80d9-467c-a94a-7f61d04ef7d5";
  if (principal.tenantId?.toLowerCase() !== home.toLowerCase()) throw new HttpError(403, "Academy organization membership is not provisioned for this Microsoft account.");
  const organizationId = process.env.LMS_HOME_ORGANIZATION_ID;
  const endpoint = process.env.LMS_COSMOS_ENDPOINT;
  const database = process.env.LMS_COSMOS_DATABASE;
  const container = process.env.LMS_COSMOS_CONTAINER;
  if (!organizationId || !endpoint || !database || !container) throw new HttpError(503, "Skunkie learner storage is not configured.");
  const store = new CosmosLmsStore(endpoint, database, container, async () => (await credential.getToken("https://cosmos.azure.com/.default")).token);
  const role = hasPortalRole(principal, ["Portal.Staff", "Portal.Admin"]) ? "staff" : hasPortalRole(principal, ["Portal.Instructor"]) ? "instructor" : "student";
  const ctx: LmsContext = { principal, organizationId, role };
  return { service: new SkunkieOrchestrationService(store), ctx };
}
async function handle(request: HttpRequest, run: (service: SkunkieOrchestrationService, ctx: LmsContext) => Promise<unknown>, purpose: "management" | "learner" = "management") {
  try {
    const { service, ctx } = await skunkieRequestContext(request);
    const scoped = purpose === "learner" ? ownLearnerContext(ctx) : ctx;
    return { ...json(request, await run(service, scoped)), headers: { ...json(request, {}).headers, "Cache-Control": "no-store" } };
  } catch (error) { return failure(request, error instanceof HttpError ? error : new HttpError(503, "Skunkie learning service is temporarily unavailable.")); }
}
app.http("skunkieLearningContext", { methods: ["GET"], authLevel: "anonymous", route: "me/skunkie/context",
  handler: request => handle(request, (service, ctx) => service.context(ctx), "learner") });
app.http("skunkieNetworkingAssess", { methods: ["POST"], authLevel: "anonymous", route: "me/skunkie/networking/assess",
  handler: request => handle(request, async (service, ctx) => service.assess(ctx, await readJson(request)), "learner") });
app.http("skunkieActivityEvaluate", { methods: ["POST"], authLevel: "anonymous", route: "me/skunkie/sessions/{sessionId}/evaluate",
  handler: request => handle(request, async (service, ctx) => service.evaluate(ctx, request.params.sessionId, await readJson(request)), "learner") });
app.http("skunkieCurriculumBind", { methods: ["PUT"], authLevel: "anonymous", route: "staff/skunkie/curriculum/{courseId}",
  handler: request => handle(request, async (service, ctx) => service.bindCurriculum(ctx, request.params.courseId, await readJson(request))) });

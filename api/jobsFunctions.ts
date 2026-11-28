import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { requireUser } from "./auth.js";
import { corsHeaders, failure, HttpError, json } from "./http.js";
import { jobsDatabase, JobsSetupRequired, type Row } from "./jobsDataverse.js";
import { isRecruiter, JobsWorkspace } from "./jobsWorkspace.js";

interface Dependencies {
  authenticate: typeof requireUser;
  workspace: () => JobsWorkspace;
}
export function jobsHandler({ authenticate, workspace }: Dependencies) {
  return async (request: HttpRequest): Promise<HttpResponseInit> => {
    const headers = { ...corsHeaders(request), "Cache-Control": "private, no-store" };
    if (request.method === "OPTIONS") return { status: 204, headers };
    try {
      const person = await authenticate(request);
      const { area, item, id } = request.params;
      if (area === "recruitment" && !isRecruiter(person)) throw new HttpError(403, "Recruiter access is required.");
      let input: Row = {};
      if (request.method !== "GET") {
        const raw = await request.text();
        if (raw.length > 8000) throw new HttpError(413, "The request is too large.");
        try { input = JSON.parse(raw); } catch { throw new HttpError(400, "A JSON object is required."); }
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "A JSON object is required.");
      }
      const service = workspace();
      if (request.method === "GET" && !item && (!area || area === "recruitment")) {
        const body = area ? await service.recruitment() : await service.dashboard(person);
        return { ...json(request, body), headers: { ...headers, "Content-Type": "application/json" } };
      }
      if (request.method === "PUT" && area === "profile" && !item) await service.saveProfile(person, input);
      else if (request.method === "POST" && area === "tracker" && !item) await service.track(person, input);
      else if (request.method === "PATCH" && area === "tracker" && item && !id) await service.track(person, input, item);
      else if (request.method === "POST" && area === "vacancies" && item && id === "apply") await service.apply(person, item, input);
      else if (request.method === "POST" && area === "recruitment" && item === "vacancies" && !id) await service.publish(person, input);
      else if (request.method === "PATCH" && area === "recruitment" && item === "vacancies" && id) await service.close(id, input);
      else if (request.method === "PATCH" && area === "recruitment" && item === "applications" && id) await service.review(id, input);
      else throw new HttpError(404, "Jobs operation not found.");
      return { status: 204, headers };
    } catch (caught) {
      if (caught instanceof JobsSetupRequired) {
        return { ...json(request, { code: "jobs_setup_required" }, 503), headers: { ...headers, "Content-Type": "application/json" } };
      }
      const error = caught instanceof HttpError ? caught : new HttpError(503, "The jobs service is unavailable. Please try again later.");
      return { ...failure(request, error), headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } };
    }
  };
}
app.http("jobsWorkspace", {
  methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"], authLevel: "anonymous",
  route: "jobs-workspace/{area?}/{item?}/{id?}", handler: jobsHandler({ authenticate: requireUser, workspace: () => new JobsWorkspace(jobsDatabase()) })
});

type StorageStatus = "ready" | "setup_required" | "unavailable";
export function jobsReadiness(verify: () => Promise<void>, now: () => number = Date.now) {
  let cached: Promise<StorageStatus> | undefined;
  let expires = 0;
  return async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (!cached || now() >= expires) {
      expires = now() + 60_000;
      cached = Promise.resolve().then(verify).then((): StorageStatus => "ready")
        .catch((error): StorageStatus => error instanceof JobsSetupRequired ? "setup_required" : "unavailable");
    }
    const status = await cached;
    const response = json(request, { status }, status === "ready" ? 200 : 503);
    return { ...response, headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" } };
  };
}
app.http("jobsStorageHealth", {
  methods: ["GET"], authLevel: "anonymous", route: "health/jobs", handler: jobsReadiness(() => jobsDatabase().verifyReads())
});

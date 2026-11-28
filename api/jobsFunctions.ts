import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { requireUser } from "./auth.js";
import { corsHeaders, failure, HttpError, json } from "./http.js";
import { jobsDatabase, type Row } from "./jobsDataverse.js";
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
      const error = caught instanceof HttpError ? caught : new HttpError(503, "The jobs service is unavailable. Please try again later.");
      return { ...failure(request, error), headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } };
    }
  };
}
app.http("jobsWorkspace", {
  methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"], authLevel: "anonymous",
  route: "jobs-workspace/{area?}/{item?}/{id?}", handler: jobsHandler({ authenticate: requireUser, workspace: () => new JobsWorkspace(jobsDatabase()) })
});

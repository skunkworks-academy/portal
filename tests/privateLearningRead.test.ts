import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../api/http.js";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";

const mocks = vi.hoisted(() => ({
  routes: new Map<string, { handler: (request: HttpRequest) => Promise<HttpResponseInit> }>(),
  requireUser: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn()
}));
vi.mock("@azure/functions", () => ({ app: { http: (name: string, route: never) => mocks.routes.set(name, route) } }));
vi.mock("../api/auth.js", () => ({ requireUser: mocks.requireUser }));
vi.mock("../api/lmsCosmosStore.js", () => ({ CosmosLmsStore: class {
  get = mocks.get; put = mocks.put; delete = mocks.delete;
} }));
import "../api/skunkieAssessmentFunctions.js";

const request = { headers: new Headers() } as HttpRequest;
beforeEach(() => {
  vi.stubEnv("ENTRA_TENANT_ID", "home-tenant");
  vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "academy");
  vi.stubEnv("LMS_COSMOS_ENDPOINT", "https://example.documents.azure.com");
  vi.stubEnv("LMS_COSMOS_DATABASE", "academy");
  vi.stubEnv("LMS_COSMOS_CONTAINER", "lms");
  mocks.requireUser.mockResolvedValue({ tenantId: "home-tenant", subject: "verified-learner", roles: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe.each([
  ["studentIdrGet", "student-idr-v1"],
  ["skunkieLearnerAssessmentGet", "skunkie-assessment-v1"]
])("private read %s", (routeName, collection) => {
  it("reads only the verified learner key, without a role requirement or any write", async () => {
    mocks.get.mockResolvedValue(null);
    const result = await mocks.routes.get(routeName)!.handler(request);
    expect(result.status).toBe(200);
    expect(result.jsonBody).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith(collection, "academy:verified-learner");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("rejects external membership before touching storage", async () => {
    mocks.requireUser.mockResolvedValue({ tenantId: "external-tenant", subject: "other-learner", roles: ["Portal.Admin"] });
    const result = await mocks.routes.get(routeName)!.handler(request);
    expect(result.status).toBe(403);
    expect(result.body).toContain("membership is not provisioned");
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("preserves scope denial and distinguishes missing storage", async () => {
    mocks.requireUser.mockRejectedValueOnce(new HttpError(403, "A delegated Portal API access_as_user scope is required."));
    expect((await mocks.routes.get(routeName)!.handler(request)).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "");
    expect((await mocks.routes.get(routeName)!.handler(request)).status).toBe(503);
  });
});

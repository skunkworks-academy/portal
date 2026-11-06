import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequest } from "@azure/functions";
import { HttpError } from "../api/http.js";
const mocks = vi.hoisted(() => ({ routes: new Map<string, any>(), user: vi.fn(), context: vi.fn(), assess: vi.fn(), evaluate: vi.fn(), bind: vi.fn() }));
vi.mock("@azure/functions", async importOriginal => ({ ...await importOriginal<typeof import("@azure/functions")>(), app: { http: (name: string, spec: any) => mocks.routes.set(name, spec) } }));
vi.mock("../api/auth.js", () => ({ requireUser: mocks.user, hasPortalRole: (user: { roles: string[] }, roles: string[]) => user.roles.some(r => roles.includes(r)) }));
vi.mock("../api/skunkieOrchestration.js", () => ({ SkunkieOrchestrationService: class { context = mocks.context; assess = mocks.assess; evaluate = mocks.evaluate; bindCurriculum = mocks.bind; } }));
await import("../api/skunkieOrchestrationFunctions.js");
const home = "338a8916-80d9-467c-a94a-7f61d04ef7d5";
const request = (method = "GET", body?: unknown) => new HttpRequest({ url: "https://example.invalid/api/me/skunkie/context", method, headers: { origin: "http://localhost:5173" }, ...(body ? { body: { string: JSON.stringify(body) } } : {}) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENTRA_TENANT_ID", home); vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "academy"); vi.stubEnv("LMS_COSMOS_ENDPOINT", "https://example.invalid"); vi.stubEnv("LMS_COSMOS_DATABASE", "test"); vi.stubEnv("LMS_COSMOS_CONTAINER", "test");
  mocks.user.mockResolvedValue({ subject: "verified-learner", tenantId: home, roles: [], name: "Synthetic", email: "synthetic@example.invalid" });
  mocks.context.mockResolvedValue({ courses: [] }); mocks.assess.mockResolvedValue({ id: "saved" });
});
describe("Skunkie API identity and availability boundary", () => {
  it("guards every new route with verified Microsoft authentication before storage", async () => {
    mocks.user.mockRejectedValue(new HttpError(401, "Invalid Microsoft access token."));
    for (const spec of mocks.routes.values()) expect((await spec.handler(request())).status).toBe(401);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.assess).not.toHaveBeenCalled(); expect(mocks.bind).not.toHaveBeenCalled();
  });
  it("does not provision external tenant membership from a login", async () => {
    mocks.user.mockResolvedValue({ subject: "external", tenantId: "external-tenant", roles: [] });
    expect((await mocks.routes.get("skunkieLearningContext").handler(request())).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("derives learner identity from the principal, not request body", async () => {
    const result = await mocks.routes.get("skunkieNetworkingAssess").handler(request("POST", { learnerSubject: "someone-else" }));
    expect(result.status).toBe(200); expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(mocks.assess.mock.calls[0][0].principal.subject).toBe("verified-learner");
  });
  it("returns unavailable for missing settings and masks unexpected provider failures", async () => {
    vi.stubEnv("LMS_COSMOS_CONTAINER", "");
    expect((await mocks.routes.get("skunkieLearningContext").handler(request())).status).toBe(503);
    vi.stubEnv("LMS_COSMOS_CONTAINER", "test");
    mocks.context.mockRejectedValue(Error("private infrastructure details"));
    const result = await mocks.routes.get("skunkieLearningContext").handler(request());
    expect(result.status).toBe(503); expect(result.body).not.toContain("private infrastructure");
  });
});

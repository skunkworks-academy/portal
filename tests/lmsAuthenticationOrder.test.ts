import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../api/http.js";
import type { HttpRequest } from "@azure/functions";

const mocks = vi.hoisted(() => ({ routes: new Map<string, { handler: (request: HttpRequest) => Promise<{ status: number; body: string }> }>(), requireUser: vi.fn() }));
vi.mock("@azure/functions", () => ({ app: { http: (name: string, route: never) => mocks.routes.set(name, route) } }));
vi.mock("../api/auth.js", () => ({ requireUser: mocks.requireUser, hasPortalRole: () => false }));
import "../api/lmsFunctions.js";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const request = { headers: new Headers(), params: {} } as HttpRequest;

describe("LMS authentication precedes storage setup", () => {
  it("returns an authentication failure on every route even when storage is missing", async () => {
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "");
    mocks.requireUser.mockRejectedValue(new HttpError(401, "Authentication required."));
    for (const route of mocks.routes.values()) expect((await route.handler(request)).status).toBe(401);
  });
  it("does not disguise missing external membership as a database outage", async () => {
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "");
    mocks.requireUser.mockResolvedValue({ tenantId: "external-tenant", subject: "learner", roles: [] });
    const response = await mocks.routes.get("lmsCoursesList")!.handler(request);
    expect(response.status).toBe(403);
    expect(response.body).toContain("membership not provisioned");
  });
  it("reports missing storage for an authorized home-tenant account", async () => {
    vi.stubEnv("ENTRA_TENANT_ID", "home-tenant");
    vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "academy");
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "");
    mocks.requireUser.mockResolvedValue({ tenantId: "home-tenant", subject: "learner", roles: [] });
    expect((await mocks.routes.get("lmsCoursesList")!.handler(request)).status).toBe(503);
  });
});

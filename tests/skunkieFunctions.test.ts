import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequest, type InvocationContext } from "@azure/functions";
import { createSkunkieHandlers } from "../api/skunkieFunctions.js";
import { SKUNKIE_BUDGET_POLICY } from "../api/skunkieReadiness.js";
import { HttpError } from "../api/http.js";
import type { Principal, requireUser } from "../api/auth.js";
import type { SkunkieBudgetService, SkunkieBudgetSnapshot } from "../api/skunkieBudget.js";

const principal: Principal = { subject: "verified-student", tenantId: "338a8916-80d9-467c-a94a-7f61d04ef7d5", roles: [], name: "Student", email: "private@example.test" };
const settings = { AZURE_OPENAI_ENDPOINT: "https://test.openai.azure.com/", AZURE_OPENAI_DEPLOYMENT: "skunkie-chat-gpt41-mini", AZURE_OPENAI_API_KEY: "private-key",
  SKUNKIE_BUDGET_POLICY, LMS_COSMOS_ENDPOINT: "https://test.documents.azure.com/", LMS_COSMOS_DATABASE: "academy", LMS_COSMOS_CONTAINER: "lms", LMS_HOME_ORGANIZATION_ID: "academy" };
const full: SkunkieBudgetSnapshot = { month: "2099-11", resetsAt: "2099-11-30T22:00:00.000Z", limitNanos: 1e9, usedNanos: 0, remainingNanos: 1e9, blocked: false, requestLimitReached: false };
const reservation = { accountKey: "hashed", month: full.month, requestId: "server-id", model: "gpt-4.1-mini" as const, reservedNanos: 420870400 };
const validResponse = () => ({ model: "gpt-4.1-mini-2025-04-14", usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }, choices: [{ message: { content: "A useful explanation." } }] });
const request = (body: unknown = { message: "Help me learn" }) => new HttpRequest({ url: "https://portal.test/api/skunkie/chat", method: "POST", body: { string: JSON.stringify(body) } });
const context = { error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;
let authenticate = vi.fn<typeof requireUser>();
let ledger = { read: vi.fn<SkunkieBudgetService["read"]>(), reserve: vi.fn<SkunkieBudgetService["reserve"]>(), settle: vi.fn<SkunkieBudgetService["settle"]>() };
let send = vi.fn<typeof fetch>();
const handlers = (env = settings) => createSkunkieHandlers({ authenticate, settings: env, budget: () => ledger, send });
beforeEach(() => {
  vi.clearAllMocks();
  authenticate = vi.fn().mockResolvedValue(principal);
  ledger = { read: vi.fn().mockResolvedValue(full), reserve: vi.fn().mockResolvedValue({ reservation, mayDispatch: true, budget: full }), settle: vi.fn().mockResolvedValue({ ...full, usedNanos: 72000, remainingNanos: 999928000 }) };
  send = vi.fn().mockImplementation(async () => Response.json(validResponse()));
});
describe("Skunkie metered provider boundary", () => {
  it("reserves verified identity and fixed bounds before any provider request, then settles provider usage", async () => {
    const order: string[] = [];
    ledger.reserve.mockImplementation(async () => { order.push("reserve"); return { reservation, mayDispatch: true, budget: full }; });
    send.mockImplementation(async () => { order.push("provider"); return Response.json(validResponse()); });
    const result = await handlers().chat(request({ message: "Hello", subject: "forged", model: "expensive", max_tokens: 99999, budget: 1000 }), context);
    expect(order).toEqual(["reserve", "provider"]);
    expect(ledger.reserve).toHaveBeenCalledWith(principal, expect.objectContaining({ model: "gpt-4.1-mini", maxInputTokens: 1048576, maxOutputTokens: 900 }));
    expect(ledger.reserve.mock.calls[0][1].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).max_tokens).toBe(900);
    expect(ledger.settle).toHaveBeenCalledWith(principal, reservation, { inputTokens: 100, outputTokens: 20 });
    expect(result.jsonBody).toMatchObject({ reply: "A useful explanation.", budget: { limitUsd: 1, remainingUsd: 0.999928, exhausted: false } });
    expect(JSON.stringify(result)).not.toMatch(/private-key|private@example|hashed/);
  });
  it("denies unauthenticated calls before storage or provider", async () => {
    authenticate.mockRejectedValue(new HttpError(401, "Missing bearer token."));
    expect((await handlers().chat(request(), context)).status).toBe(401);
    expect(ledger.reserve).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("requires Student eligibility even for a management account", async () => {
    authenticate.mockResolvedValue({ ...principal, roles: ["Portal.Staff"] });
    expect((await handlers().status(request())).jsonBody).toEqual({ available: false, reason: "not_eligible" });
    expect((await handlers().chat(request(), context)).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    authenticate.mockResolvedValue({ ...principal, roles: ["Portal.Staff", "Portal.Student"] });
    expect((await handlers().chat(request(), context)).status).toBe(200);
  });
  it("cannot activate from provider settings without the pinned budget policy", async () => {
    expect((await handlers({ ...settings, SKUNKIE_BUDGET_POLICY: "" }).chat(request(), context)).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
  it("allows a signed-in read-only storage preflight before provider activation", async () => {
    const result = await handlers({ ...settings, AZURE_OPENAI_API_KEY: "", SKUNKIE_BUDGET_POLICY: "" }).status(request());
    expect(result.jsonBody).toMatchObject({ available: false, budget: { remainingUsd: 1 } });
    expect(ledger.read).toHaveBeenCalledWith(principal);
    expect(ledger.reserve).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("distinguishes a frozen ledger from ordinary monthly exhaustion", async () => {
    ledger.read.mockResolvedValue({ ...full, blocked: true });
    expect((await handlers().status(request())).jsonBody).toEqual({ available: false, reason: "budget_unavailable" });
  });
  it.each([null, { message: 42 }, { message: " " }, { message: "ok", history: {} }])("rejects malformed payload before reserving %j", async payload => {
    expect((await handlers().chat(request(payload), context)).status).toBe(400);
    expect(ledger.reserve).not.toHaveBeenCalled();
  });
  it("fails closed on missing storage without sending a paid request", async () => {
    ledger.reserve.mockRejectedValue(new HttpError(503, "Unavailable"));
    expect((await handlers().chat(request(), context)).status).toBe(503); expect(send).not.toHaveBeenCalled();
    ledger.read.mockRejectedValue(new Error("sensitive details"));
    expect((await handlers().status(request())).jsonBody).toEqual({ available: false, reason: "budget_unavailable" });
  });
  it("returns explicit monthly limit with a positive residual that cannot safely cover another call", async () => {
    ledger.reserve.mockRejectedValue(new HttpError(429, "Allowance"));
    ledger.read.mockResolvedValue({ ...full, usedNanos: 600e6, remainingNanos: 400e6 });
    const result = await handlers().chat(request(), context);
    expect(result.status).toBe(429);
    expect(result.jsonBody).toMatchObject({ code: "monthly_ai_limit", budget: { remainingUsd: 0.4, exhausted: true } });
    expect(send).not.toHaveBeenCalled();
  });
  it("does not dispatch a repeated reservation", async () => {
    ledger.reserve.mockResolvedValue({ reservation, mayDispatch: false, budget: full });
    expect((await handlers().chat(request(), context)).status).toBe(409); expect(send).not.toHaveBeenCalled();
  });
  it.each([400, 408, 429, 500])("retains a hold on provider HTTP%s and does not label it monthly exhaustion", async status => {
    send.mockResolvedValue(new Response("secret provider error", { status }));
    const result = await handlers().chat(request(), context);
    expect(result.status).toBe(status === 429 ? 429 : 502);
    expect(result.jsonBody).toBeUndefined(); expect(ledger.settle).not.toHaveBeenCalled(); expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(context.error).mock.calls)).not.toContain("secret provider error");
  });
  it("retains a hold on network failure without leaking raw error details", async () => {
    send.mockRejectedValue(new Error("private-key"));
    const result = await handlers().chat(request(), context);
    expect(result.status).toBe(502); expect(result.body).not.toContain("private-key"); expect(ledger.settle).not.toHaveBeenCalled();
  });
  it.each(["missing", "wrong-model", "negative", "bad-total"])("retains a hold for unverifiable usage: %s", async kind => {
    const body: any = validResponse();
    if (kind === "missing") delete body.usage;
    if (kind === "wrong-model") body.model = "other";
    if (kind === "negative") body.usage.completion_tokens = -1;
    if (kind === "bad-total") body.usage.total_tokens = 1;
    send.mockResolvedValue(Response.json(body));
    expect((await handlers().chat(request(), context)).status).toBe(502); expect(ledger.settle).not.toHaveBeenCalled();
  });
  it("settles billable empty output before returning a retryable error", async () => {
    send.mockResolvedValue(Response.json({ ...validResponse(), choices: [] }));
    expect((await handlers().chat(request(), context)).status).toBe(502); expect(ledger.settle).toHaveBeenCalledTimes(1);
  });
  it("withholds a normal success if trusted usage exceeded the safe bound", async () => {
    ledger.settle.mockResolvedValue({ ...full, blocked: true });
    expect((await handlers().chat(request(), context)).status).toBe(503);
  });
});

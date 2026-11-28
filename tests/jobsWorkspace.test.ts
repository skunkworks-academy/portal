import { HttpRequest } from "@azure/functions";
import { describe, expect, it, vi } from "vitest";
import { config } from "../api/config.js";
import { HttpError } from "../api/http.js";
import type { Principal } from "../api/auth.js";
import { JobsDataverse, JobsSetupRequired, jobsConnection, type Row, type Table } from "../api/jobsDataverse.js";
import { jobsHandler, jobsReadiness } from "../api/jobsFunctions.js";
import { isRecruiter, JobsWorkspace, stableId } from "../api/jobsWorkspace.js";
import { metrics } from "../src/jobs/model.js";

const candidate: Principal = { subject: "person-one", tenantId: config.entraTenantId, roles: [], name: "", email: "" };
const second = { ...candidate, subject: "person-two" };
const recruiter = { ...candidate, roles: ["Jobs.Recruiter"] };
const requestId = "b569aaf8-eeeb-47ea-893a-57c007e87bff";
const vacancy = "00000000-0000-4000-8000-000000000001";
const candidateId = stableId("candidate", candidate.tenantId!, candidate.subject);
const entry = stableId("tracker", candidateId, requestId);
const ver = 'W/"17"';
const draft = { requestId, title: "Systems engineer", company: "Test employer", source: "Referral", stage: "Interview", followUp: "2026-11-27", nextAction: "Prepare questions" };
function setup() {
  const rows = new Map<string, Row>();
  const store = {
    col: (name: string) => "sw_" + name, lookup: (name: string) => "_sw_" + name + "_value",
    get: vi.fn(async (table: Table, id: string) => rows.get(table + id) ?? null),
    list: vi.fn(async (): Promise<Row[]> => []),
    bind: vi.fn(async (name: string, _table: Table, id: string) => ({ ["_sw_" + name + "_value"]: id })),
    write: vi.fn(async (table: Table, id: string, data: Row, version: string | null) => {
      const key = table + id, old = rows.get(key);
      if (old ? old["@odata.etag"] !== version : version !== null) throw new HttpError(409, "Record changed");
      rows.set(key, { ...old, ...data, ["sw_" + table + "id"]: id, "@odata.etag": ver, createdon: "2026-11-25T09:00:00Z" });
    }),
    submit: vi.fn(async (_vid: string, _version: string, id: string, data: Row) => {
      rows.set("jobentry" + id, { ...data, sw_jobentryid: id, "@odata.etag": ver, createdon: "2026-11-25T09:00:00Z" });
    })
  };
  return { rows, store, service: new JobsWorkspace(store as unknown as JobsDataverse) };
}
describe("Jobs candidate and recruiter boundaries", () => {
  it("uses verified tenant and subject, never contact email, to isolate candidates", async () => {
    const { service, store } = setup();
    await service.dashboard(candidate);
    expect(store.list).toHaveBeenCalledWith("jobentry", expect.any(Array), "_sw_candidate_value eq " + candidateId);
    await service.dashboard({ ...candidate, tenantId: "unrelated" });
    expect(store.list.mock.calls.at(-1)).not.toEqual(store.list.mock.calls[1]);
    expect(store.write).not.toHaveBeenCalled();
  });
  it("permits only the home-tenant recruiter role to read HR records", async () => {
    expect(isRecruiter(recruiter)).toBe(true);
    const database = vi.fn();
    for (const person of [candidate, { ...candidate, roles: ["Portal.Admin"] }, { ...recruiter, tenantId: "external" }]) {
      const response = await jobsHandler({ authenticate: async () => person, workspace: database })(new HttpRequest({ method: "GET", url: "https://test/api/jobs-workspace/recruitment", params: { area: "recruitment" } }));
      expect(response.status).toBe(403);
    }
    expect(database).not.toHaveBeenCalled();
  });
  it("rejects a missing session before resolving Dynamics", async () => {
    const db = vi.fn();
    const response = await jobsHandler({ authenticate: async () => { throw new HttpError(401, "Sign in"); }, workspace: db })(new HttpRequest({ method: "GET", url: "https://test/api/jobs-workspace" }));
    expect(response.status).toBe(401); expect(db).not.toHaveBeenCalled();
    expect(response.headers).toMatchObject({ "Cache-Control": "private, no-store" });
  });
  it("requires explicit storage consent and rejects identity or role overrides", async () => {
    const { service, store } = setup();
    const input = { name: "Candidate", email: "candidate@example.test", consent: false };
    await expect(service.saveProfile(candidate, input)).rejects.toMatchObject({ status: 400 });
    await expect(service.saveProfile(candidate, { ...input, consent: true, owner: "other" })).rejects.toMatchObject({ status: 400 });
    await service.saveProfile(candidate, { ...input, consent: true });
    expect(store.write).toHaveBeenCalledWith("jobprofile", candidateId, expect.objectContaining({ sw_consent: "jobs-profile-v1" }), null);
  });
  it("retries external tracking without duplicates and rejects cross-account edits", async () => {
    const { rows, service } = setup();
    rows.set("jobprofile" + candidateId, {});
    await service.track(candidate, draft); await service.track(candidate, draft);
    expect(rows.size).toBe(2);
    await expect(service.track(candidate, { ...draft, title: "Different role" })).rejects.toMatchObject({ status: 409 });
    const { requestId: _id, ...update } = draft;
    await expect(service.track(second, { ...update, version: ver }, entry)).rejects.toMatchObject({ status: 404 });
    await expect(service.track(candidate, { ...update, version: 'W/"2"' }, entry)).rejects.toMatchObject({ status: 409 });
    await expect(service.track(candidate, { ...update, version: ver, followUp: "2026-02-30" }, entry)).rejects.toMatchObject({ status: 400 });
    await expect(service.review(entry, { stage: "Offer", version: ver })).rejects.toMatchObject({ status: 404 });
  });
  it("allows explicit submissions for open vacancies only, shares a contact snapshot and deduplicates retries", async () => {
    const { service, store, rows } = setup();
    rows.set("jobprofile"+candidateId, { sw_name: "Candidate", sw_email: "candidate@example.test" });
    rows.set("jobvacancy"+vacancy, { sw_name: "Role", sw_employer: "Example", sw_open: false, "@odata.etag": ver });
    await expect(service.apply(candidate, vacancy, { share: false })).rejects.toMatchObject({ status: 400 });
    await expect(service.apply(candidate, vacancy, { share: true })).rejects.toMatchObject({ status: 409 });
    rows.get("jobvacancy"+vacancy)!.sw_open = true;
    await service.apply(candidate, vacancy, { share: true }); await service.apply(candidate, vacancy, { share: true });
    expect(store.submit).toHaveBeenCalledTimes(1);
    expect(store.submit).toHaveBeenCalledWith(vacancy, ver, stableId("application", candidateId, vacancy), expect.objectContaining({ sw_contactemail: "candidate@example.test", sw_stage: "Applied", _sw_vacancy_value: vacancy }));
    await service.recruitment();
    expect(store.list).toHaveBeenLastCalledWith("jobentry", expect.any(Array), "_sw_vacancy_value ne null", 200);
  });
  it("counts overdue or current follow-ups from active records only", () => {
    const base = { id: entry, vacancyId: null, source: "Referral", title: "Role", company: "Test", nextAction: "", created: "", version: ver, followUp: "2026-11-28" };
    expect(metrics([{ ...base, stage: "Interview" }, { ...base, stage: "Closed" }, { ...base, stage: "Offer", followUp: "" }], new Date(2026,10,28))).toEqual({ active:2, interviews:1, offers:1, due:1 });
  });
});
describe("Dataverse Web API transport", () => {
  it("reads entity names from metadata, follows pages and never forwards tokens to another host", async () => {
    const origin = "https://example.crm14.dynamics.com";
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ EntitySetName: "actual_vacancies", PrimaryIdAttribute: "sw_jobvacancyid" }))
      .mockResolvedValueOnce(Response.json({ value: [{ title: "A" }], "@odata.nextLink": origin + "/api/data/v9.2/actual_vacancies?cursor=2" }))
      .mockResolvedValueOnce(Response.json({ value: [{ title: "B" }] }))
      .mockResolvedValueOnce(Response.json({ value: [], "@odata.nextLink": "https://outside.example/records" }));
    const token = vi.fn(async () => ({ token: "test" }));
    const db = new JobsDataverse(origin, "sw", token, send);
    expect(await db.list("jobvacancy", ["sw_name"], "sw_open eq true")).toHaveLength(2);
    expect(new URL(String(send.mock.calls[1][0])).searchParams.get("$filter")).toBe("sw_open eq true");
    await expect(db.list("jobvacancy", ["sw_name"])).rejects.toMatchObject({ status: 503 });
    expect(send).toHaveBeenCalledTimes(4); expect(token).toHaveBeenCalledWith(origin + "/.default");
  });
  it("commits the ETag-checked vacancy and create-only application together and handles a closed-vacancy race", async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ EntitySetName:"vacancies", PrimaryIdAttribute:"sw_jobvacancyid" }))
      .mockResolvedValueOnce(Response.json({ EntitySetName:"activities", PrimaryIdAttribute:"sw_jobentryid" }))
      .mockResolvedValueOnce(new Response("--response\r\nHTTP/1.1 204 No Content\r\n\r\nHTTP/1.1 204 No Content\r\n"))
      .mockResolvedValueOnce(new Response("--response\r\nHTTP/1.1 412 Precondition Failed\r\n"));
    const db = new JobsDataverse("https://example.crm14.dynamics.com","sw",async () => ({ token:"test" }),send);
    await db.submit(vacancy, ver, entry, { sw_name: "Role" });
    expect(String(send.mock.calls[2][0])).toMatch(/\$batch$/);
    const batch = String(send.mock.calls[2][1]?.body);
    expect(batch).toContain("If-Match: " + ver); expect(batch).toContain("If-None-Match: *");
    await expect(db.submit(vacancy, ver, entry, { sw_name: "Role" })).rejects.toMatchObject({ status:409 });
  });
});

describe("Jobs storage readiness", () => {
  it("requires an application in Dynamics when the Function is hosted in another directory", () => {
    const env = { JOBS_DATAVERSE_PREFIX: "sw", JOBS_HOST_TENANT_ID: "338a8916-80d9-467c-a94a-7f61d04ef7d5" };
    expect(() => jobsConnection(env)).toThrow(JobsSetupRequired);
    expect(() => jobsConnection({ ...env, JOBS_DATAVERSE_URL: "https://different.crm14.dynamics.com" })).toThrow(JobsSetupRequired);
    expect(() => jobsConnection({ ...env, JOBS_DATAVERSE_CLIENT_ID: requestId, JOBS_DATAVERSE_CLIENT_SECRET: "@Microsoft.KeyVault(SecretUri=test)" })).toThrow(JobsSetupRequired);
    expect(jobsConnection({ ...env, JOBS_DATAVERSE_CLIENT_ID: requestId, JOBS_DATAVERSE_CLIENT_SECRET: "fixture" }).origin).toBe("https://sw.crm14.dynamics.com");
  });
  it("coalesces checks and recovers after configuration is restored", async () => {
    let now = 0;
    const verify = vi.fn().mockRejectedValueOnce(new JobsSetupRequired()).mockResolvedValue(undefined);
    const check = jobsReadiness(verify, () => now);
    const req = new HttpRequest({ method: "GET", url: "https://example.invalid/api/health/jobs" });
    for (const result of await Promise.all([check(req), check(req)])) {
      expect(result).toMatchObject({ status: 503, jsonBody: { status: "setup_required" } });
    }
    expect(verify).toHaveBeenCalledTimes(1);
    now = 60001;
    expect(await check(req)).toMatchObject({ status: 200, jsonBody: { status: "ready" } });
  });
  it("checks read access to each table without selecting any candidate fields or writing records", async () => {
    const send = vi.fn<typeof fetch>(async url => {
      const u = new URL(String(url));
      if (u.pathname.includes("EntityDefinitions")) {
        const table = u.pathname.match(/LogicalName='(sw_\w+)'/)![1];
        return Response.json({ EntitySetName: table + "s", PrimaryIdAttribute: table + "id" });
      }
      const id = u.searchParams.get("$select");
      expect(id).toMatch(/^sw_job(profile|entry|vacancy)id$/);
      expect(u.searchParams.get("$filter")).toBe(id + " eq null");
      return Response.json({ value: [] });
    });
    const db = new JobsDataverse("https://sw.crm14.dynamics.com", "sw", async () => ({ token: "test" }), send);
    await db.verifyReads();
    expect(send).toHaveBeenCalledTimes(6);
    expect(send.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
});

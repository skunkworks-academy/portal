import { ClientSecretCredential } from "@azure/identity";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";
import type { ApplicationRecord, JobInput, JobPosting, NewApplication, OnboardingTask } from "../src/types.js";
import type { Principal } from "./auth.js";

const graphRoot = "https://graph.microsoft.com/v1.0";
let credential: ClientSecretCredential | undefined;
let siteIdCache: string | undefined;
const listIdCache = new Map<string, string>();
const driveIdCache = new Map<string, string>();

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  requireSettings(["graphTenantId", "apiClientId", "apiClientSecret"]);
  credential ??= new ClientSecretCredential(config.graphTenantId, config.apiClientId, config.apiClientSecret);
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  if (!token) throw new HttpError(500, "Unable to acquire Microsoft Graph token.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${graphRoot}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, body || `Graph request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function siteId() {
  requireSettings(["sharePointHostname", "sharePointSitePath"]);
  if (siteIdCache) return siteIdCache;
  const site = await graph<{ id: string }>(`/sites/${config.sharePointHostname}:${config.sharePointSitePath}`);
  siteIdCache = site.id;
  return site.id;
}

async function listId(displayName: string) {
  const cached = listIdCache.get(displayName);
  if (cached) return cached;
  const site = await siteId();
  const result = await graph<{ value: Array<{ id: string; displayName: string }> }>(`/sites/${site}/lists?$select=id,displayName`);
  const list = result.value.find((item) => item.displayName === displayName);
  if (!list) throw new HttpError(500, `SharePoint list ${displayName} was not found.`);
  listIdCache.set(displayName, list.id);
  return list.id;
}

async function driveId(displayName: string) {
  const cached = driveIdCache.get(displayName);
  if (cached) return cached;
  const site = await siteId();
  const result = await graph<{ value: Array<{ id: string; name: string }> }>(`/sites/${site}/drives?$select=id,name`);
  const drive = result.value.find((item) => item.name === displayName);
  if (!drive) throw new HttpError(500, `SharePoint library ${displayName} was not found.`);
  driveIdCache.set(displayName, drive.id);
  return drive.id;
}

async function listItems(listName: string, filter?: string) {
  const site = await siteId();
  const list = await listId(listName);
  const query = filter ? `&$filter=${encodeURIComponent(filter)}` : "";
  return graph<{ value: Array<{ id: string; fields: Record<string, unknown> }> }>(
    `/sites/${site}/lists/${list}/items?expand=fields${query}`
  );
}

async function createItem(listName: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(listName);
  return graph<{ id: string; fields: Record<string, unknown> }>(`/sites/${site}/lists/${list}/items?expand=fields`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function patchItem(listName: string, id: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(listName);
  await graph(`/sites/${site}/lists/${list}/items/${id}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
  return graph<{ id: string; fields: Record<string, unknown> }>(`/sites/${site}/lists/${list}/items/${id}?expand=fields`);
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function number(value: unknown) {
  return Number(value ?? 0);
}

function toJob(item: { id: string; fields: Record<string, unknown> }): JobPosting {
  const fields = item.fields;
  return {
    id: item.id,
    title: text(fields.Title),
    programme: text(fields.Programme),
    modality: text(fields.Modality),
    rateBand: text(fields.RateBand),
    closingDate: text(fields.ClosingDate),
    status: (text(fields.Status) || "Draft") as JobPosting["status"],
    description: text(fields.Description),
    applicants: number(fields.Applicants)
  };
}

function toApplication(item: { id: string; fields: Record<string, unknown> }): ApplicationRecord {
  const fields = item.fields;
  return {
    id: item.id,
    jobId: text(fields.JobId),
    jobTitle: text(fields.JobTitle),
    applicantName: text(fields.ApplicantName),
    applicantEmail: text(fields.ApplicantEmail),
    phone: text(fields.Phone),
    discipline: text(fields.Discipline),
    availability: text(fields.Availability),
    experience: text(fields.Experience),
    status: (text(fields.Status) || "Submitted") as ApplicationRecord["status"],
    owner: text(fields.Owner),
    submittedAt: text(fields.SubmittedAt),
    documentUrl: text(fields.DocumentUrl) || undefined
  };
}

function toTask(item: { id: string; fields: Record<string, unknown> }): OnboardingTask {
  const fields = item.fields;
  return {
    id: item.id,
    title: text(fields.Title),
    candidateName: text(fields.CandidateName),
    owner: text(fields.Owner),
    dueDate: text(fields.DueDate),
    status: (text(fields.Status) || "Due") as OnboardingTask["status"],
    detail: text(fields.Detail)
  };
}

export async function getLiveJobs() {
  const result = await listItems("JobPostings", "fields/Status eq 'Live'");
  return result.value.map(toJob);
}

export async function getAllJobs() {
  const result = await listItems("JobPostings");
  return result.value.map(toJob);
}

export async function createJob(input: JobInput) {
  const item = await createItem("JobPostings", {
    Title: input.title,
    Programme: input.programme,
    Modality: input.modality,
    RateBand: input.rateBand,
    ClosingDate: input.closingDate,
    Status: input.status,
    Description: input.description,
    Applicants: 0
  });
  return toJob(item);
}

export async function updateJob(id: string, input: Partial<JobInput>) {
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.Title = input.title;
  if (input.programme !== undefined) fields.Programme = input.programme;
  if (input.modality !== undefined) fields.Modality = input.modality;
  if (input.rateBand !== undefined) fields.RateBand = input.rateBand;
  if (input.closingDate !== undefined) fields.ClosingDate = input.closingDate;
  if (input.status !== undefined) fields.Status = input.status;
  if (input.description !== undefined) fields.Description = input.description;
  return toJob(await patchItem("JobPostings", id, fields));
}

export async function createApplication(input: NewApplication, principal: Principal) {
  const jobs = await getAllJobs();
  const job = jobs.find((item) => item.id === input.jobId);
  if (!job || job.status !== "Live") throw new HttpError(400, "Selected job is not open for applications.");

  const documentUrl = input.resumeBase64 && input.resumeFileName
    ? await uploadApplicantFile(input.resumeFileName, input.resumeBase64, principal)
    : "";

  const item = await createItem("Applications", {
    Title: `${input.applicantName} - ${job.title}`,
    JobId: input.jobId,
    JobTitle: job.title,
    ApplicantName: input.applicantName,
    ApplicantEmail: input.applicantEmail,
    Phone: input.phone,
    Discipline: input.discipline,
    Availability: input.availability,
    Experience: input.experience,
    Status: "Submitted",
    Owner: "",
    SubmittedAt: new Date().toISOString(),
    DocumentUrl: documentUrl,
    ApplicantObjectId: principal.subject,
    ApplicantTenantId: principal.tenantId ?? ""
  });

  await patchItem("JobPostings", job.id, { Applicants: job.applicants + 1 });
  await audit("ApplicationSubmitted", principal, item.id);
  return toApplication(item);
}

export async function getMyApplications(principal: Principal) {
  const result = await listItems("Applications", `fields/ApplicantObjectId eq '${principal.subject.replaceAll("'", "''")}'`);
  return result.value.map(toApplication);
}

export async function getApplications() {
  const result = await listItems("Applications");
  return result.value.map(toApplication);
}

export async function updateApplication(id: string, input: Partial<Pick<ApplicationRecord, "status" | "owner">>, principal: Principal) {
  const fields: Record<string, unknown> = {};
  if (input.status !== undefined) fields.Status = input.status;
  if (input.owner !== undefined) fields.Owner = input.owner;
  const item = await patchItem("Applications", id, fields);
  await audit("ApplicationUpdated", principal, id);
  return toApplication(item);
}

export async function getTasks() {
  const result = await listItems("OnboardingTasks");
  return result.value.map(toTask);
}

export async function updateTask(id: string, input: Partial<OnboardingTask>, principal: Principal) {
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.Title = input.title;
  if (input.candidateName !== undefined) fields.CandidateName = input.candidateName;
  if (input.owner !== undefined) fields.Owner = input.owner;
  if (input.dueDate !== undefined) fields.DueDate = input.dueDate;
  if (input.status !== undefined) fields.Status = input.status;
  if (input.detail !== undefined) fields.Detail = input.detail;
  const item = await patchItem("OnboardingTasks", id, fields);
  await audit("TaskUpdated", principal, id);
  return toTask(item);
}

async function uploadApplicantFile(fileName: string, base64: string, principal: Principal) {
  const site = await siteId();
  const drive = await driveId("ApplicantUploads");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = `${principal.subject || "unknown"}-${Date.now()}`;
  const bytes = Buffer.from(base64, "base64");
  const upload = await graph<{ webUrl: string }>(`/sites/${site}/drives/${drive}/root:/${folder}/${safeName}:/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes
  });
  return upload.webUrl;
}

async function audit(action: string, principal: Principal, targetId: string) {
  await createItem("AuditEvents", {
    Title: action,
    ActorName: principal.name,
    ActorEmail: principal.email,
    ActorTenantId: principal.tenantId ?? "",
    TargetId: targetId,
    OccurredAt: new Date().toISOString()
  });
}

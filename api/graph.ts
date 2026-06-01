import { ClientSecretCredential } from "@azure/identity";
import { config, requireSettings } from "./config.js";
import { fallbackClasses, fallbackCourses } from "./fallbackData.js";
import { HttpError } from "./http.js";
import type { ApplicationRecord, ClassInput, ClassRegistrationRecord, ClassSession, CourseRecord, JobInput, JobPosting, NewApplication, OnboardingTask, PortalProfile, PortalProfileInput, PortalRole } from "../src/types.js";
import { portalRoleFromPrincipal, type Principal } from "./auth.js";

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

function escapeOData(value: string) {
  return value.replaceAll("'", "''");
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

function toCourse(item: { id: string; fields: Record<string, unknown> }): CourseRecord {
  const fields = item.fields;
  return {
    id: item.id,
    title: text(fields.Title),
    level: text(fields.Level),
    duration: text(fields.Duration),
    description: text(fields.Description),
    status: (text(fields.Status) || "Draft") as CourseRecord["status"]
  };
}

function toClassSession(item: { id: string; fields: Record<string, unknown> }): ClassSession {
  const fields = item.fields;
  return {
    id: item.id,
    courseId: text(fields.CourseId),
    courseTitle: text(fields.CourseTitle),
    title: text(fields.Title),
    schedule: text(fields.Schedule),
    modality: text(fields.Modality),
    instructor: text(fields.Instructor),
    seats: number(fields.Seats),
    enrolled: number(fields.Enrolled),
    status: (text(fields.Status) || "Scheduled") as ClassSession["status"]
  };
}

function toClassRegistration(item: { id: string; fields: Record<string, unknown> }): ClassRegistrationRecord {
  const fields = item.fields;
  return {
    id: item.id,
    classId: text(fields.ClassId),
    classTitle: text(fields.ClassTitle),
    courseId: text(fields.CourseId),
    courseTitle: text(fields.CourseTitle),
    studentName: text(fields.StudentName),
    studentEmail: text(fields.StudentEmail),
    studentObjectId: text(fields.StudentObjectId),
    status: (text(fields.Status) || "Registered") as ClassRegistrationRecord["status"],
    registeredAt: text(fields.RegisteredAt)
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

function toPortalProfile(item: { id: string; fields: Record<string, unknown> }): PortalProfile {
  const fields = item.fields;
  return {
    id: item.id,
    objectId: text(fields.ObjectId),
    displayName: text(fields.DisplayName),
    email: text(fields.Email),
    portalRole: (text(fields.PortalRole) || "Student") as PortalProfile["portalRole"],
    phone: text(fields.Phone),
    location: text(fields.Location),
    bio: text(fields.Bio),
    cvFileName: text(fields.CvFileName),
    cvDocumentUrl: text(fields.CvDocumentUrl) || undefined,
    updatedAt: text(fields.UpdatedAt)
  };
}

function classFields(input: ClassInput, enrolled = 0) {
  return {
    Title: input.title,
    CourseId: input.courseId,
    CourseTitle: input.courseTitle,
    Schedule: input.schedule,
    Modality: input.modality,
    Instructor: input.instructor,
    Seats: input.seats,
    Enrolled: enrolled,
    Status: input.status
  };
}

function sameClassSession(left: ClassSession, right: ClassSession) {
  return left.courseId === right.courseId && left.title === right.title && left.schedule === right.schedule;
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

export async function getCourses() {
  const result = await listItems("Courses", "fields/Status eq 'Live'");
  const courses = result.value.map(toCourse);
  return courses.length ? courses : fallbackCourses;
}

export async function getClasses() {
  const result = await listItems("ClassSessions");
  const classes = result.value.map(toClassSession);
  return classes.length ? classes : fallbackClasses;
}

export async function createClass(input: ClassInput, principal: Principal) {
  const item = await createItem("ClassSessions", classFields(input));
  await audit("ClassCreated", principal, item.id);
  return toClassSession(item);
}

export async function updateClass(id: string, input: Partial<ClassInput>, principal: Principal) {
  const fallbackClass = fallbackClasses.find((item) => item.id === id);
  if (fallbackClass) {
    const classItems = await listItems("ClassSessions");
    const existing = classItems.value.map(toClassSession).find((item) => sameClassSession(item, fallbackClass));
    const merged = { ...fallbackClass, ...input };
    const item = existing
      ? await patchItem("ClassSessions", existing.id, classFields(merged, existing.enrolled))
      : await createItem("ClassSessions", classFields(merged, fallbackClass.enrolled));
    await audit(existing ? "ClassUpdated" : "ClassMaterialized", principal, item.id);
    return toClassSession(item);
  }

  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.Title = input.title;
  if (input.courseId !== undefined) fields.CourseId = input.courseId;
  if (input.courseTitle !== undefined) fields.CourseTitle = input.courseTitle;
  if (input.schedule !== undefined) fields.Schedule = input.schedule;
  if (input.modality !== undefined) fields.Modality = input.modality;
  if (input.instructor !== undefined) fields.Instructor = input.instructor;
  if (input.seats !== undefined) fields.Seats = input.seats;
  if (input.status !== undefined) fields.Status = input.status;
  const item = await patchItem("ClassSessions", id, fields);
  await audit("ClassUpdated", principal, id);
  return toClassSession(item);
}

export async function getMyClassRegistrations(principal: Principal) {
  const result = await listItems("ClassRegistrations", `fields/StudentObjectId eq '${escapeOData(principal.subject)}'`);
  return result.value.map(toClassRegistration);
}

export async function getClassRegistrations() {
  const result = await listItems("ClassRegistrations");
  return result.value.map(toClassRegistration);
}

export async function registerForClass(classId: string, principal: Principal) {
  const classItems = await listItems("ClassSessions");
  const sharePointClasses = classItems.value.map(toClassSession);
  let classSession = sharePointClasses.find((item) => item.id === classId);
  const fallbackClass = fallbackClasses.find((item) => item.id === classId);
  let isSharePointClass = Boolean(classSession);

  if (!classSession && fallbackClass) {
    classSession = sharePointClasses.find((item) => sameClassSession(item, fallbackClass));
    isSharePointClass = Boolean(classSession);
  }

  if (!classSession && fallbackClass) {
    const item = await createItem("ClassSessions", classFields(fallbackClass, fallbackClass.enrolled));
    classSession = toClassSession(item);
    isSharePointClass = true;
    await audit("ClassMaterializedForRegistration", principal, item.id);
  }

  if (!classSession || !["Scheduled", "Open"].includes(classSession.status)) throw new HttpError(400, "Selected class is not open for registration.");

  const existing = await listItems("ClassRegistrations", `fields/ClassId eq '${escapeOData(classSession.id)}' and fields/StudentObjectId eq '${escapeOData(principal.subject)}'`);
  if (existing.value[0]) return toClassRegistration(existing.value[0]);

  const isFull = classSession.enrolled >= classSession.seats;
  const item = await createItem("ClassRegistrations", {
    Title: `${principal.name || principal.email} - ${classSession.title}`,
    ClassId: classSession.id,
    ClassTitle: classSession.title,
    CourseId: classSession.courseId,
    CourseTitle: classSession.courseTitle,
    StudentName: principal.name,
    StudentEmail: principal.email,
    StudentObjectId: principal.subject,
    Status: isFull ? "Waitlisted" : "Registered",
    RegisteredAt: new Date().toISOString()
  });

  if (isSharePointClass && !isFull) {
    await patchItem("ClassSessions", classSession.id, {
      Enrolled: classSession.enrolled + 1,
      Status: classSession.enrolled + 1 >= classSession.seats ? "Full" : classSession.status
    });
  }
  await audit("ClassRegistered", principal, item.id);
  return toClassRegistration(item);
}

export async function createApplication(input: NewApplication, principal: Principal) {
  const jobs = await getAllJobs();
  const job = jobs.find((item) => item.id === input.jobId);
  if (!job || job.status !== "Live") throw new HttpError(400, "Selected job is not open for applications.");

  const documentUrl = input.resumeBase64 && input.resumeFileName
    ? await uploadDocument("ApplicantUploads", input.resumeFileName, input.resumeBase64, principal)
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
  const result = await listItems("Applications", `fields/ApplicantObjectId eq '${escapeOData(principal.subject)}'`);
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

export async function getMyProfile(principal: Principal) {
  const result = await listItems("PortalProfiles", `fields/ObjectId eq '${escapeOData(principal.subject)}'`);
  const existing = result.value[0];
  if (existing) return toPortalProfile(existing);
  return null;
}

export async function getProfiles(role?: PortalRole) {
  const result = await listItems("PortalProfiles", role ? `fields/PortalRole eq '${escapeOData(role)}'` : undefined);
  return result.value.map(toPortalProfile);
}

export async function upsertMyProfile(input: PortalProfileInput, principal: Principal) {
  const existing = await getMyProfile(principal);
  const cvDocumentUrl = input.cvBase64 && input.cvFileName
    ? await uploadDocument("InstructorDocuments", input.cvFileName, input.cvBase64, principal)
    : existing?.cvDocumentUrl ?? "";
  const cvFileName = input.cvFileName || existing?.cvFileName || "";
  const fields = {
    Title: input.displayName || principal.name || principal.email,
    ObjectId: principal.subject,
    DisplayName: input.displayName || principal.name,
    Email: principal.email,
    PortalRole: portalRoleFromPrincipal(principal),
    Phone: input.phone,
    Location: input.location,
    Bio: input.bio,
    CvFileName: cvFileName,
    CvDocumentUrl: cvDocumentUrl,
    UpdatedAt: new Date().toISOString()
  };

  const item = existing
    ? await patchItem("PortalProfiles", existing.id, fields)
    : await createItem("PortalProfiles", fields);
  await audit("ProfileUpdated", principal, item.id);
  return toPortalProfile(item);
}

async function uploadDocument(libraryName: string, fileName: string, base64: string, principal: Principal) {
  const site = await siteId();
  const drive = await driveId(libraryName);
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

import { ClientSecretCredential } from "@azure/identity";
import { randomUUID } from "node:crypto";
import type { Principal } from "./auth.js";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";

export const publishedCourseCatalog = [
  { id: "SHP-UPA-101", title: "Shopify User Permissions" },
  { id: "GHP-DOM-101", title: "GitHub Pages Setup" },
  { id: "M365-LIC-101", title: "Microsoft 365 Licenses" },
  { id: "SKW-BEG-AI-101", title: "Generative AI & ChatGPT for Beginners" },
  { id: "SKW-BEG-CYB-101", title: "Cybersecurity Essentials & Online Safety" },
  { id: "SKW-BEG-IT-101", title: "IT Support & Computer Troubleshooting Fundamentals" },
  { id: "SKW-BEG-M365-101", title: "Microsoft 365 & Excel Productivity Essentials" },
  { id: "SKW-BEG-CLD-101", title: "Cloud Computing Fundamentals" }
] as const;

export type PublishedCourseId = typeof publishedCourseCatalog[number]["id"];
export type EnrolmentStatus =
  | "Submitted"
  | "PendingPayment"
  | "Active"
  | "Waitlisted"
  | "Suspended"
  | "Cancelled"
  | "Completed"
  | "Rejected";
export type EnrolmentSource = "checkout" | "portal" | "admin" | "migration";

export interface EnrolmentRequestInput {
  courseId?: string;
  learnerName?: string;
  learnerEmail?: string;
  planId?: string;
  gateway?: string;
  returnUrl?: string;
  source?: string;
  website?: string;
}

export interface EnrolmentRecord {
  id: string;
  courseId: string;
  courseTitle: string;
  learnerObjectId: string;
  learnerTenantId: string;
  learnerEmail: string;
  learnerName: string;
  status: EnrolmentStatus;
  source: EnrolmentSource;
  planId: string;
  gateway: string;
  paymentTransactionId: string;
  entitlementId: string;
  providerReference: string;
  returnUrl: string;
  submittedAt: string;
  activatedAt: string;
  updatedAt: string;
  notes: string;
}

type GraphListItem = { id: string; fields: Record<string, unknown> };
type GraphListResponse = { value: GraphListItem[]; "@odata.nextLink"?: string };
type QueryRecord = { id: string } & Record<string, unknown>;
type EntitlementRecord = {
  id: string;
  customerEmail: string;
  status: string;
  validUntil: string;
  paymentTransactionId: string;
  providerReference: string;
};

const graphRoot = "https://graph.microsoft.com/v1.0";
let credential: ClientSecretCredential | undefined;
let cachedSiteId = "";
const cachedListIds = new Map<string, string>();

export function isPublishedCourseId(value: unknown): value is PublishedCourseId {
  const id = clean(value).toUpperCase();
  return publishedCourseCatalog.some((course) => course.id === id);
}

export function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export async function submitAnonymousEnrolment(input: EnrolmentRequestInput) {
  if (clean(input.website)) throw new HttpError(400, "Invalid enrolment request.");
  const course = requireCourse(input.courseId);
  const learnerEmail = requireEmail(input.learnerEmail);
  const existing = await findLearnerCourseEnrolment(course.id, "", learnerEmail);
  const planId = limited(input.planId, 100);
  const gateway = normalizeGateway(input.gateway);
  const requestedStatus: EnrolmentStatus = planId && gateway !== "manual" ? "PendingPayment" : "Submitted";

  const fields = buildFields({
    course,
    learnerEmail,
    learnerName: limited(input.learnerName, 160),
    learnerObjectId: existing?.learnerObjectId ?? "",
    learnerTenantId: existing?.learnerTenantId ?? "",
    status: existing && ["Active", "Completed"].includes(existing.status) ? existing.status : requestedStatus,
    source: "checkout",
    planId,
    gateway,
    paymentTransactionId: existing?.paymentTransactionId ?? "",
    entitlementId: existing?.entitlementId ?? "",
    providerReference: existing?.providerReference ?? "",
    returnUrl: safeReturnUrl(input.returnUrl) || existing?.returnUrl || "",
    submittedAt: existing?.submittedAt || now(),
    activatedAt: existing?.activatedAt || "",
    notes: existing?.notes || ""
  });

  const item = existing
    ? await patchItem("CourseEnrollments", existing.id, fields)
    : await createItem("CourseEnrollments", fields);
  const record = toEnrolment(item);
  await audit("CourseEnrolmentSubmitted", learnerEmail, record.id, course.id);
  return record;
}

export async function submitAuthenticatedEnrolment(input: EnrolmentRequestInput, principal: Principal) {
  const course = requireCourse(input.courseId);
  const learnerEmail = requireEmail(principal.email);
  const existing = await findLearnerCourseEnrolment(course.id, principal.subject, learnerEmail);

  const fields = buildFields({
    course,
    learnerEmail,
    learnerName: limited(input.learnerName || principal.name, 160),
    learnerObjectId: principal.subject,
    learnerTenantId: principal.tenantId ?? "",
    status: existing && ["Active", "Completed"].includes(existing.status) ? existing.status : "Submitted",
    source: "portal",
    planId: limited(input.planId, 100),
    gateway: normalizeGateway(input.gateway || "manual"),
    paymentTransactionId: existing?.paymentTransactionId ?? "",
    entitlementId: existing?.entitlementId ?? "",
    providerReference: existing?.providerReference ?? "",
    returnUrl: safeReturnUrl(input.returnUrl) || existing?.returnUrl || "",
    submittedAt: existing?.submittedAt || now(),
    activatedAt: existing?.activatedAt || "",
    notes: existing?.notes || ""
  });

  const item = existing
    ? await patchItem("CourseEnrollments", existing.id, fields)
    : await createItem("CourseEnrollments", fields);
  const record = toEnrolment(item);
  await audit("CourseEnrolmentSubmitted", principal.email, record.id, course.id);
  return record;
}

export async function listMyEnrolments(principal: Principal) {
  const email = normalizeEmail(principal.email);
  const records = (await allItems("CourseEnrollments"))
    .map(toEnrolment)
    .filter((record) => matchesPrincipal(record, principal.subject, email));

  for (const record of records) {
    if (!record.learnerObjectId && principal.subject) {
      await patchItem("CourseEnrollments", record.id, {
        LearnerObjectId: principal.subject,
        LearnerTenantId: principal.tenantId ?? "",
        LearnerName: record.learnerName || principal.name,
        UpdatedAt: now()
      });
      record.learnerObjectId = principal.subject;
      record.learnerTenantId = principal.tenantId ?? "";
      record.learnerName ||= principal.name;
    }
  }

  return records.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export async function resolveCourseAccess(courseIdValue: unknown, principal: Principal) {
  const course = requireCourse(courseIdValue);
  const learnerEmail = requireEmail(principal.email);
  let record = await findLearnerCourseEnrolment(course.id, principal.subject, learnerEmail);
  if (!record) throw new HttpError(403, "No enrolment record was found for this learner and course.");

  if (!record.learnerObjectId && principal.subject) {
    record = toEnrolment(await patchItem("CourseEnrollments", record.id, {
      LearnerObjectId: principal.subject,
      LearnerTenantId: principal.tenantId ?? "",
      LearnerName: record.learnerName || principal.name,
      UpdatedAt: now()
    }));
  }

  if (["Active", "Completed"].includes(record.status)) {
    if (record.entitlementId || record.paymentTransactionId) {
      const entitlement = await findLinkedEntitlement(record, learnerEmail);
      if (!entitlement || !isEntitlementActive(entitlement)) {
        record = toEnrolment(await patchItem("CourseEnrollments", record.id, {
          Status: "Suspended",
          UpdatedAt: now(),
          Notes: appendNote(record.notes, "Linked subscription entitlement is no longer active.")
        }));
        await audit("CourseAccessDenied", principal.email, record.id, course.id);
        throw new HttpError(403, "The subscription entitlement linked to this enrolment is inactive or expired.");
      }
    }

    await audit("CourseAccessAllowed", principal.email, record.id, course.id);
    return allowedResponse(record, principal);
  }

  if (["Submitted", "PendingPayment"].includes(record.status)) {
    const entitlement = await findActiveEntitlement(learnerEmail);
    if (entitlement) {
      record = toEnrolment(await patchItem("CourseEnrollments", record.id, {
        Status: "Active",
        EntitlementId: entitlement.id,
        PaymentTransactionId: entitlement.paymentTransactionId,
        ProviderReference: entitlement.providerReference,
        ActivatedAt: now(),
        UpdatedAt: now()
      }));
      await audit("CourseEnrolmentActivated", principal.email, record.id, course.id);
      return allowedResponse(record, principal);
    }
  }

  await audit("CourseAccessDenied", principal.email, record.id, course.id);
  throw new HttpError(403, `Enrolment status ${record.status} does not grant course access.`);
}

export async function listAdminEnrolments(filters: { courseId?: string; status?: string; email?: string }) {
  const courseId = clean(filters.courseId).toUpperCase();
  const status = clean(filters.status).toLowerCase();
  const email = normalizeEmail(filters.email);
  return (await allItems("CourseEnrollments"))
    .map(toEnrolment)
    .filter((record) => !courseId || record.courseId === courseId)
    .filter((record) => !status || record.status.toLowerCase() === status)
    .filter((record) => !email || normalizeEmail(record.learnerEmail).includes(email))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export async function updateAdminEnrolment(
  id: string,
  input: {
    status?: string;
    notes?: string;
    paymentTransactionId?: string;
    entitlementId?: string;
    providerReference?: string;
  },
  principal: Principal
) {
  const status = requireStatus(input.status);
  const fields: Record<string, unknown> = {
    Status: status,
    UpdatedAt: now()
  };
  if (status === "Active") fields.ActivatedAt = now();
  if (input.notes !== undefined) fields.Notes = limited(input.notes, 2000);
  if (input.paymentTransactionId !== undefined) fields.PaymentTransactionId = limited(input.paymentTransactionId, 160);
  if (input.entitlementId !== undefined) fields.EntitlementId = limited(input.entitlementId, 160);
  if (input.providerReference !== undefined) fields.ProviderReference = limited(input.providerReference, 200);

  const record = toEnrolment(await patchItem("CourseEnrollments", clean(id), fields));
  await audit("CourseEnrolmentUpdated", principal.email, record.id, record.courseId);
  return record;
}

export async function listAdminSubscriptions(filters: { email?: string; status?: string }) {
  const email = normalizeEmail(filters.email);
  const status = clean(filters.status).toLowerCase();
  const [transactionItems, entitlementItems] = await Promise.all([
    allItems("PaymentTransactions"),
    allItems("Entitlements")
  ]);
  const transactions: QueryRecord[] = transactionItems.map((item) => ({ id: item.id, ...item.fields }));
  const entitlements: QueryRecord[] = entitlementItems.map((item) => ({ id: item.id, ...item.fields }));
  const filter = (record: QueryRecord) =>
    (!email || normalizeEmail(record["CustomerEmail"]).includes(email)) &&
    (!status || clean(record["Status"]).toLowerCase() === status);
  return {
    transactions: transactions.filter(filter),
    entitlements: entitlements.filter(filter)
  };
}

function requireCourse(value: unknown) {
  const id = clean(value).toUpperCase();
  const course = publishedCourseCatalog.find((item) => item.id === id);
  if (!course) throw new HttpError(404, "Unknown or unpublished course.");
  return course;
}

function requireEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!email || !email.includes("@") || email.length > 254) {
    throw new HttpError(400, "A valid learner email address is required.");
  }
  return email;
}

function requireStatus(value: unknown): EnrolmentStatus {
  const status = clean(value) as EnrolmentStatus;
  const allowed: EnrolmentStatus[] = [
    "Submitted",
    "PendingPayment",
    "Active",
    "Waitlisted",
    "Suspended",
    "Cancelled",
    "Completed",
    "Rejected"
  ];
  if (!allowed.includes(status)) throw new HttpError(400, "A valid enrolment status is required.");
  return status;
}

function normalizeGateway(value: unknown) {
  const gateway = clean(value).toLowerCase() || "manual";
  if (!["payfast", "paypal", "manual", "none"].includes(gateway)) {
    throw new HttpError(400, "Unsupported enrolment gateway.");
  }
  return gateway;
}

function limited(value: unknown, maximum: number) {
  return clean(value).slice(0, maximum);
}

function safeReturnUrl(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.href.slice(0, 1000) : "";
  } catch {
    return "";
  }
}

function appendNote(existing: string, message: string) {
  const prefix = clean(existing);
  const entry = `${now()} ${message}`;
  return (prefix ? `${prefix}\n${entry}` : entry).slice(0, 2000);
}

function buildFields(input: {
  course: { id: PublishedCourseId; title: string };
  learnerEmail: string;
  learnerName: string;
  learnerObjectId: string;
  learnerTenantId: string;
  status: EnrolmentStatus;
  source: EnrolmentSource;
  planId: string;
  gateway: string;
  paymentTransactionId: string;
  entitlementId: string;
  providerReference: string;
  returnUrl: string;
  submittedAt: string;
  activatedAt: string;
  notes: string;
}) {
  const fields: Record<string, string> = {
    Title: `${input.course.id} - ${input.learnerEmail}`.slice(0, 255),
    CourseId: input.course.id,
    CourseTitle: input.course.title,
    LearnerObjectId: input.learnerObjectId,
    LearnerTenantId: input.learnerTenantId,
    LearnerEmail: input.learnerEmail,
    LearnerName: input.learnerName,
    Status: input.status,
    Source: input.source,
    PlanId: input.planId,
    Gateway: input.gateway,
    PaymentTransactionId: input.paymentTransactionId,
    EntitlementId: input.entitlementId,
    ProviderReference: input.providerReference,
    ReturnUrl: input.returnUrl,
    SubmittedAt: input.submittedAt,
    UpdatedAt: now(),
    Notes: input.notes
  };

  if (input.activatedAt) fields.ActivatedAt = input.activatedAt;
  return fields;
}

function matchesPrincipal(record: EnrolmentRecord, objectId: string, email: string) {
  if (record.learnerObjectId) return Boolean(objectId) && record.learnerObjectId === objectId;
  return Boolean(email) && normalizeEmail(record.learnerEmail) === email;
}

async function findLearnerCourseEnrolment(courseId: string, objectId: string, email: string) {
  const records = (await allItems("CourseEnrollments")).map(toEnrolment);
  return records.find((record) => record.courseId === courseId && matchesPrincipal(record, objectId, email)) ?? null;
}

function isEntitlementActive(record: EntitlementRecord) {
  const expiry = Date.parse(record.validUntil);
  return record.status === "Active" && (!record.validUntil || Number.isNaN(expiry) || expiry > Date.now());
}

async function findLinkedEntitlement(enrolment: EnrolmentRecord, email: string) {
  const records = (await allItems("Entitlements")).map(toEntitlement);
  if (enrolment.entitlementId) {
    const byId = records.find((record) => record.id === enrolment.entitlementId);
    if (byId) return byId;
  }
  if (enrolment.paymentTransactionId) {
    const byPayment = records.find((record) =>
      record.paymentTransactionId === enrolment.paymentTransactionId && normalizeEmail(record.customerEmail) === email
    );
    if (byPayment) return byPayment;
  }
  return null;
}

async function findActiveEntitlement(email: string) {
  return (await allItems("Entitlements"))
    .map(toEntitlement)
    .find((record) => normalizeEmail(record.customerEmail) === email && isEntitlementActive(record)) ?? null;
}

function allowedResponse(record: EnrolmentRecord, principal: Principal) {
  return {
    allowed: true,
    courseId: record.courseId,
    learnerId: principal.subject,
    enrolmentId: record.id,
    enrolmentStatus: "active",
    returnUrl: record.returnUrl || undefined
  };
}

function toEnrolment(item: GraphListItem): EnrolmentRecord {
  const fields = item.fields;
  return {
    id: item.id,
    courseId: clean(fields["CourseId"]).toUpperCase(),
    courseTitle: clean(fields["CourseTitle"]),
    learnerObjectId: clean(fields["LearnerObjectId"]),
    learnerTenantId: clean(fields["LearnerTenantId"]),
    learnerEmail: normalizeEmail(fields["LearnerEmail"]),
    learnerName: clean(fields["LearnerName"]),
    status: (clean(fields["Status"]) || "Submitted") as EnrolmentStatus,
    source: (clean(fields["Source"]) || "portal") as EnrolmentSource,
    planId: clean(fields["PlanId"]),
    gateway: clean(fields["Gateway"]),
    paymentTransactionId: clean(fields["PaymentTransactionId"]),
    entitlementId: clean(fields["EntitlementId"]),
    providerReference: clean(fields["ProviderReference"]),
    returnUrl: clean(fields["ReturnUrl"]),
    submittedAt: clean(fields["SubmittedAt"]),
    activatedAt: clean(fields["ActivatedAt"]),
    updatedAt: clean(fields["UpdatedAt"]),
    notes: clean(fields["Notes"])
  };
}

function toEntitlement(item: GraphListItem): EntitlementRecord {
  return {
    id: item.id,
    customerEmail: normalizeEmail(item.fields["CustomerEmail"]),
    status: clean(item.fields["Status"]),
    validUntil: clean(item.fields["ValidUntil"]),
    paymentTransactionId: clean(item.fields["PaymentTransactionId"]),
    providerReference: clean(item.fields["ProviderReference"])
  };
}

async function audit(action: string, actorEmail: string, targetId: string, courseId: string) {
  try {
    await createItem("AuditEvents", {
      Title: action,
      ActorName: actorEmail,
      ActorEmail: actorEmail,
      ActorTenantId: "",
      TargetId: targetId,
      Detail: courseId,
      OccurredAt: now()
    });
  } catch {
    // Enrolment and access decisions do not fail solely because audit storage is unavailable.
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function now() {
  return new Date().toISOString();
}

async function graph<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  requireSettings(["graphTenantId", "apiClientId", "apiClientSecret", "sharePointHostname", "sharePointSitePath"]);
  credential ??= new ClientSecretCredential(config.graphTenantId, config.apiClientId, config.apiClientSecret);
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  if (!token) throw new HttpError(500, "Unable to acquire Microsoft Graph token.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${graphRoot}${pathOrUrl}`;
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new HttpError(response.status, await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function siteId() {
  if (cachedSiteId) return cachedSiteId;
  const site = await graph<{ id: string }>(`/sites/${config.sharePointHostname}:${config.sharePointSitePath}`);
  cachedSiteId = site.id;
  return cachedSiteId;
}

async function listId(name: string) {
  const cached = cachedListIds.get(name);
  if (cached) return cached;
  const site = await siteId();
  const response = await graph<{ value: Array<{ id: string; displayName: string }> }>(
    `/sites/${site}/lists?$select=id,displayName`
  );
  const list = response.value.find((item) => item.displayName === name);
  if (!list) throw new HttpError(500, `SharePoint list ${name} was not found. Run payment and enrolment provisioning first.`);
  cachedListIds.set(name, list.id);
  return list.id;
}

async function allItems(name: string) {
  const site = await siteId();
  const list = await listId(name);
  let next = `${graphRoot}/sites/${site}/lists/${list}/items?expand=fields&$top=999`;
  const items: GraphListItem[] = [];
  while (next) {
    const page = await graph<GraphListResponse>(next);
    items.push(...page.value);
    next = page["@odata.nextLink"] || "";
  }
  return items;
}

async function createItem(name: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(name);
  return graph<GraphListItem>(`/sites/${site}/lists/${list}/items?expand=fields`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function patchItem(name: string, id: string, fields: Record<string, unknown>) {
  if (!id) throw new HttpError(400, "A record ID is required.");
  const site = await siteId();
  const list = await listId(name);
  const encodedId = encodeURIComponent(id);
  await graph(`/sites/${site}/lists/${list}/items/${encodedId}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
  return graph<GraphListItem>(`/sites/${site}/lists/${list}/items/${encodedId}?expand=fields`);
}


// Official Academy completion is explicitly issued by authorised staff after
// documented assessment. Browser-local checklists and quiz scores are NEVER
// accepted as proof of this credential.
export const beginnerCourseCodes = [
 "SKW-BEG-AI-101","SKW-BEG-CYB-101","SKW-BEG-IT-101","SKW-BEG-M365-101","SKW-BEG-CLD-101"
] as const;
export type BeginnerCourseCode=typeof beginnerCourseCodes[number];
export type BeginnerAward={
 version:1;certificateId:string;courseId:BeginnerCourseCode;
 learnerName:string;issuedAt:string;knowledgeCorrect:number;
 capstoneScore:number;criticalSafetyPassed:true;approvedBy:string;
};
const AWARD_MARKER="ACADEMY_BEGINNER_AWARD_V1:";
export function requireBeginnerCode(value:unknown):BeginnerCourseCode {
 const code=clean(value).toUpperCase();
 if(!beginnerCourseCodes.includes(code as BeginnerCourseCode))throw new HttpError(404,"Unknown beginner course.");
 return code as BeginnerCourseCode;
}
function parseAward(notes:string):BeginnerAward|null {
 const match=notes.match(/(?:^|\n)ACADEMY_BEGINNER_AWARD_V1:([A-Za-z0-9_-]+)/);
 if(!match)return null;
 try{
  const value=JSON.parse(Buffer.from(match[1],"base64url").toString("utf8")) as Partial<BeginnerAward>;
  if(value.version!==1||!value.certificateId||!value.courseId||!value.issuedAt||!value.learnerName||
     !value.approvedBy||value.criticalSafetyPassed!==true||typeof value.knowledgeCorrect!=="number"||typeof value.capstoneScore!=="number"||
     !Number.isInteger(value.knowledgeCorrect)||!Number.isInteger(value.capstoneScore)||
     value.knowledgeCorrect<10||value.knowledgeCorrect>12||value.capstoneScore<70||value.capstoneScore>100)return null;
  requireBeginnerCode(value.courseId);
  return value as BeginnerAward;
 }catch{return null;}
}
export async function issueBeginnerAward(enrolmentId:string,input:{
 knowledgeCorrect?:number;capstoneScore?:number;criticalSafetyPassed?:boolean;
 evidenceReviewed?:boolean; reviewerNotes?:string;
},principal:Principal) {
 const items=await allItems("CourseEnrollments");
 const record=items.map(toEnrolment).find(x=>x.id===clean(enrolmentId));
 if(!record)throw new HttpError(404,"Enrolment not found.");
 const courseId=requireBeginnerCode(record.courseId);
 if(!["Active","Completed"].includes(record.status))throw new HttpError(409,"An active enrolment is required before award approval.");
 if(!record.learnerName.trim())throw new HttpError(409,"Learner legal name must be confirmed on the enrolment.");
 if(!Number.isInteger(input.knowledgeCorrect)||input.knowledgeCorrect!<10||input.knowledgeCorrect!>12)
  throw new HttpError(400,"Knowledge assessment requires 10–12 correct answers out of twelve.");
 if(!Number.isInteger(input.capstoneScore)||input.capstoneScore!<70||input.capstoneScore!>100)
  throw new HttpError(400,"Capstone score must be 70–100.");
 if(input.criticalSafetyPassed!==true||input.evidenceReviewed!==true)
  throw new HttpError(400,"An authorised reviewer must confirm evidence and all critical safety controls.");
 if(clean(input.reviewerNotes).length<12)
  throw new HttpError(400,"Document specific reviewed evidence and assessment basis (minimum 12 characters).");
 const existing=parseAward(record.notes);
 if(existing&&existing.courseId===courseId)
  throw new HttpError(409,"An award already exists. Reissue requires a formal revocation and audit workflow.");
 const award:BeginnerAward={version:1,certificateId:"SKW-"+randomUUID().toUpperCase(),
   courseId,learnerName:record.learnerName,issuedAt:now(),
   knowledgeCorrect:input.knowledgeCorrect!,capstoneScore:input.capstoneScore!,
   criticalSafetyPassed:true,approvedBy:principal.email};
 const entry=AWARD_MARKER+Buffer.from(JSON.stringify(award),"utf8").toString("base64url");
 const notes=[clean(record.notes).slice(0,100),entry,
   "Reviewer: "+clean(input.reviewerNotes).slice(0,300)].filter(Boolean).join("\n");
 if(notes.length>2000)throw new HttpError(400,"Evidence metadata is too long.");
 await patchItem("CourseEnrollments",record.id,{Status:"Completed",Notes:notes,UpdatedAt:now()});
 await audit("AcademyBeginnerCertificateIssued",principal.email,record.id,award.certificateId);
 return award;
}
export async function myBeginnerAward(courseIdValue:unknown,principal:Principal) {
 const code=requireBeginnerCode(courseIdValue);
 const email=normalizeEmail(principal.email);
 const records=(await allItems("CourseEnrollments")).map(toEnrolment);
 const record=records.find(x=>x.courseId===code&&matchesPrincipal(x,principal.subject,email));
 if(!record||record.status!=="Completed")throw new HttpError(404,"No verified completion award has been issued for this learner and course.");
 const award=parseAward(record.notes);
 if(!award||award.courseId!==code||award.learnerName!==record.learnerName)throw new HttpError(404,"No valid verified award is recorded.");
 return award;
}
export async function verifyBeginnerAward(id:string) {
 if(!/^SKW-[0-9A-F-]{36}$/.test(id))throw new HttpError(404,"Certificate not found.");
 const records=(await allItems("CourseEnrollments")).map(toEnrolment);
 const matching=records.find(x=>x.status==="Completed"&&x.notes.includes(AWARD_MARKER)&&
   parseAward(x.notes)?.certificateId===id);
 if(!matching)return {valid:false};
 const award=parseAward(matching.notes);
 return award?{valid:true,courseId:award.courseId,
   courseTitle:publishedCourseCatalog.find(x=>x.id===award.courseId)?.title,
   issuedAt:award.issuedAt,issuer:"Skunkworks Academy"}:{valid:false};
}
export function beginnerAwardSvg(award:BeginnerAward,kind:"certificate"|"badge") {
 const safe=(s:string)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
 const title=publishedCourseCatalog.find(x=>x.id===award.courseId)?.title||award.courseId;
 const name=safe(award.learnerName.slice(0,130)),course=safe(title),serial=safe(award.certificateId);
 const date=safe(new Date(award.issuedAt).toLocaleDateString("en-ZA",{timeZone:"UTC",year:"numeric",month:"long",day:"numeric"}));
 const verify="https://api.skunkworksacademy.com/api/certificates/verify/"+encodeURIComponent(award.certificateId);
 if(kind==="badge")return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="Skunkworks Academy verified course completion badge"><rect width="600" height="600" rx="45" fill="#03033a"/><circle cx="300" cy="242" r="164" fill="#1e6bd0" stroke="#ffffff" stroke-width="12"/><path d="M226 236 278 290 379 177" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><text x="300" y="350" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="33" fill="#fff">VERIFIED</text><text x="300" y="451" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="30" fill="#fff">SKUNKWORKS ACADEMY</text><text x="300" y="497" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#fff">'+safe(award.courseId)+'</text><text x="300" y="547" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#fff">'+serial+'</text></svg>';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850" role="img" aria-label="Skunkworks Academy course completion certificate"><rect width="1200" height="850" fill="#f7f9fc"/><rect x="32" y="32" width="1136" height="786" rx="12" fill="#fff" stroke="#03033a" stroke-width="4"/><rect x="47" y="47" width="1106" height="756" rx="7" fill="none" stroke="#1e6bd0" stroke-width="2"/><g transform="translate(104,92)"><image x="0" y="0" width="89" height="89" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAFdklEQVR42u2Za4xdUxTHf+feGe3MqGdR76oWmSYV/UA0HeIxNCUh8WpURIgELUnJfFAqEv3gCwnilYqiXtNovNMIKWmIFiG0I0gVJWI8Zjrq0c69c48P/jv52zkzxjzO1OSs5OTee/bae6+199r/9V/7QiGFFFJIIYUUUkghhYyIJLvBnGmek5dHYIySxqnZmKXIkZLNlWYsQJ0+08g2H6ecoZP7DpfM0ayxs4ybCOyl9t+A3//juAO1jarDYeIZwPXAHDmzBXgGaDedWcBFQAtwFLCP5t4BbAM2As8D69WnD2gFrgJmauE+BB4CNgzX6aE6C3AW0COD4meNnLpBDqSDeB7WuHf1014DFkU25AI6CTAF6JIhvXKqD6gCu/R+GXCdvv+ptj4ZHp6q2mrAvYqEFKjoCeNWpJMCJw4Vg0pDBLoUWAjsK0PKETjVy8jFwKHS38OAKLEn6IffN8uxAGZBv6TFQYuYW5ap0+cTMmxnFHIeglXgq0GEcui3TSDWn16vdN8bqsPDOQfByAnAZoFONSO1TDXdgY5JDTgcaIzmAHgXeEeRkCp6hgU+Q5FP1f9x4Epgtu1+TCxCWFYzHO8bwJawEM0Cstult2UEecSgF6kFWKfvH9vKx6Hap/Yd9r7PwCu1tLNrgHDfrrS3Crg2Ol65SINC7CY7X7GxwbGNWqC7M/RWA6cArxqKx+NU9LlKc+85Vny4AfjOdrIapRPf9Q/Ub7a+fw3M1zirI92ajVOx8SvAtLzzsJ+dcwyNs1C1Gu3+GvVrBPbX9+WRTnUAhE6BNktZuUmdMaKahdwrwB3AI0oxvmtB52Ib53g5WDUSEs5ru8Z6Smc7nOW1eQJWvMNrbfUviXT21plNI6c+F/gAvGTtYWGeU3pymQN0q/0zC+ck7zP8toxYaTufKDcHuTNyOhUHP9iQOrx/0foFZhaiqU063wJNeTscVvhNGdGqd01GHOqthu2QXgjN+1VhOXvqBg4yZ8M8k/Q5Q/rfWHtuTCtM9IM+vzD++xpwgc5snYx8MCo8zhAXD8QkUSh3Kjp6VSC8ryKlpp3tAX5We663JSFkF2nSyda2Uu+uMCebM4hGjOTn2ULOBf4ANkUL3GklZEOeYHW5OPKBWvUjzbDpKvcqwMl6Pwn4PiPteJnYrP6HmO58i8SS3p8qOxbncY6Dw+sUtihtnB+dvRtl8AYzeNMAVVCXQhftYAqsiFJgM/C6HDxa49WPptOJGd+l8jAYstRq4XJEKFr1e6vC+hNzdCvwq0rMRiF3CjwrZ0rm8NVCd7S7KXDYaLKuxMLzJ4XtNHN6QgYYXqqnUYvUplIyhHMnsAT4RUfhJEVHPGdZJCVcAn6p/jPzcLhRiJnq0q2+H+bjRpwpVF5mrKtqu3m2obajedZYKwwLmkebVwcjPjJm9LJYlRMPp6BlXQUdoahwtA5OtyhyyhFHds5cAu6zftuB/UYbuMLk90QGb1YqybrgD31uizh1apVQe0Y//36ckZzQ/608qqayXc++EQFQTTtwQKQbdqnDyry4uO+xXJ5Y3wbgVl3YhwX+UbXzkjwvAZrEhGYJcFK7rdgJLDB6icCl9i/EI05tcy0fV6zyOhc4Rvk6Vz7t4bZet40XAk/LuGtMZ2FGOMdhvdz0T5NzId93qMo6nTGUJDo/84zunaDSMaSSW6K62Xc7vHtMulOAF3S54GNPtKOSMDb/fGaCRp3x7WMjolCJznDVdvgB6U6NcKDUD5CNuZQjNuYy3e68Ut1gdkdXN/P6Ach47N1Wkghxl8qxR/n775fJQuAUeNIWKvk/ODdYwrKAf/6zAHDZaBcBY+2072SJcS5ZZ7E83na2kEIKKaSQQgoppJBCxqP8BWQdFzUBWZSBAAAAAElFTkSuQmCC"/><text x="110" y="40" font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="#03033a">SKUNKWORKS</text><text x="113" y="70" font-family="Arial,sans-serif" font-size="26" letter-spacing="7" fill="#1e6bd0">ACADEMY</text></g><text x="600" y="275" text-anchor="middle" font-size="20" font-family="Arial,sans-serif" letter-spacing="4" fill="#1e6bd0">CERTIFICATE OF</text><text x="600" y="331" text-anchor="middle" font-size="47" font-weight="bold" font-family="Georgia,serif" fill="#03033a">COURSE COMPLETION</text><text x="600" y="381" text-anchor="middle" font-size="21" font-family="Arial,sans-serif" fill="#334155">Awarded to</text><text x="600" y="449" text-anchor="middle" font-size="46" font-family="Georgia,serif" fill="#03033a">'+name+'</text><text x="600" y="501" text-anchor="middle" font-size="20" font-family="Arial,sans-serif" fill="#334155">for successfully completing the Skunkworks Academy course</text><text x="600" y="545" text-anchor="middle" font-size="26" font-weight="bold" font-family="Arial,sans-serif" fill="#1e6bd0" textLength="930" lengthAdjust="spacingAndGlyphs">'+course+'</text><path d="M103 602h994" stroke="#e2e8f0" stroke-width="2"/><text x="185" y="657" font-size="19" font-family="Arial,sans-serif" fill="#03033a">Issued: '+date+'</text><text x="185" y="697" font-size="17" font-family="Arial,sans-serif" fill="#334155">Certificate ID: '+serial+'</text><text x="880" y="664" text-anchor="middle" font-size="43" font-family="cursive,Georgia,serif" font-style="italic" fill="#03033a">Raydo Matthee</text><path d="M735 686H1025" stroke="#03033a" stroke-width="2"/><text x="880" y="718" text-anchor="middle" font-size="18" font-family="Arial,sans-serif" fill="#334155">Authorised Academy signatory</text><text x="600" y="772" text-anchor="middle" font-size="14" font-family="Arial,sans-serif" fill="#475569">Verify certificate: '+safe(verify)+'</text></svg>';
}

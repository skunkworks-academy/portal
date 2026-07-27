import { ClientSecretCredential } from "@azure/identity";
import { config, requireSettings } from "./config.js";
import type { Principal } from "./auth.js";
import { HttpError } from "./http.js";

export const publishedCourseCatalog = [
  { id: "SHP-UPA-101", title: "Shopify User Permissions" },
  { id: "GHP-DOM-101", title: "GitHub Pages Setup" },
  { id: "M365-LIC-101", title: "Microsoft 365 Licenses" }
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

type GraphListItem = {
  id: string;
  fields: Record<string, unknown>;
};

type GraphListResponse = {
  value: GraphListItem[];
  "@odata.nextLink"?: string;
};

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
let siteIdCache = "";
const listIdCache = new Map<string, string>();

export function isPublishedCourseId(value: unknown): value is PublishedCourseId {
  const id = clean(value).toUpperCase();
  return publishedCourseCatalog.some((course) => course.id === id);
}

export function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export async function submitAnonymousEnrolment(input: EnrolmentRequestInput) {
  if (clean(input.website)) throw new HttpError(400, "Invalid enrolment request.");
  const course = requirePublishedCourse(input.courseId);
  const learnerEmail = requireEmail(input.learnerEmail);
  const learnerName = limited(input.learnerName, 160);
  const planId = limited(input.planId, 100);
  const gateway = normalizeGateway(input.gateway);
  const source: EnrolmentSource = "checkout";
  const status: EnrolmentStatus = planId && gateway !== "manual" ? "PendingPayment" : "Submitted";

  const existing = await findLearnerCourseEnrolment(course.id, "", learnerEmail);
  const fields = enrolmentFields({
    course,
    learnerEmail,
    learnerName,
    learnerObjectId: existing?.learnerObjectId ?? "",
    learnerTenantId: existing?.learnerTenantId ?? "",
    status: existing && ["Active", "Completed"].includes(existing.status) ? existing.status : status,
    source,
    planId,
    gateway,
    returnUrl: safeReturnUrl(input.returnUrl),
    submittedAt: existing?.submittedAt || now(),
    activatedAt: existing?.activatedAt || "",
    notes: existing?.notes || ""
  });

  const item = existing
    ? await patchItem("CourseEnrollments", existing.id, fields)
    : await createItem("CourseEnrollments", fields);
  const enrolment = toEnrolment(item);
  await audit("CourseEnrolmentSubmitted", learnerEmail, enrolment.id, course.id);
  return enrolment;
}

export async function submitAuthenticatedEnrolment(input: EnrolmentRequestInput, principal: Principal) {
  const course = requirePublishedCourse(input.courseId);
  const learnerEmail = requireEmail(principal.email);
  const learnerName = limited(input.learnerName || principal.name, 160);
  const existing = await findLearnerCourseEnrolment(course.id, principal.subject, learnerEmail);

  const fields = enrolmentFields({
    course,
    learnerEmail,
    learnerName,
    learnerObjectId: principal.subject,
    learnerTenantId: principal.tenantId ?? "",
    status: existing && ["Active", "Completed"].includes(existing.status) ? existing.status : "Submitted",
    source: "portal",
    planId: limited(input.planId, 100),
    gateway: normalizeGateway(input.gateway || "manual"),
    returnUrl: safeReturnUrl(input.returnUrl),
    submittedAt: existing?.submittedAt || now(),
    activatedAt: existing?.activatedAt || "",
    notes: existing?.notes || ""
  });

  const item = existing
    ? await patchItem("CourseEnrollments", existing.id, fields)
    : await createItem("CourseEnrollments", fields);
  const enrolment = toEnrolment(item);
  await audit("CourseEnrolmentSubmitted", principal.email, enrolment.id, course.id);
  return enrolment;
}

export async function listMyEnrolments(principal: Principal) {
  const records = await allItems("CourseEnrollments");
  const email = normalizeEmail(principal.email);
  const matching = records
    .map(toEnrolment)
    .filter((record) =>
      (principal.subject && record.learnerObjectId === principal.subject) ||
      (email && normalizeEmail(record.learnerEmail) === email)
    );

  for (const record of matching) {
    if (!record.learnerObjectId && principal.subject) {
      await patchItem("CourseEnrollments", record.id, {
        LearnerObjectId: principal.subject,
        LearnerTenantId: principal.tenantId ?? "",
        LearnerName: record.learnerName || principal.name,
        UpdatedAt: now()
      });
      record.learnerObjectId = principal.subject;
      record.learnerTenantId = principal.tenantId ?? "";
      record.learnerName = record.learnerName || principal.name;
    }
  }

  return matching.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export async function resolveCourseAccess(courseIdValue: unknown, principal: Principal) {
  const course = requirePublishedCourse(courseIdValue);
  const learnerEmail = requireEmail(principal.email);
  let enrolment = await findLearnerCourseEnrolment(course.id, principal.subject, learnerEmail);
  if (!enrolment) throw new HttpError(403, "No enrolment record was found for this learner and course.");

  if (!enrolment.learnerObjectId && principal.subject) {
    enrolment = toEnrolment(await patchItem("CourseEnrollments", enrolment.id, {
      LearnerObjectId: principal.subject,
      LearnerTenantId: principal.tenantId ?? "",
      LearnerName: enrolment.learnerName || principal.name,
      UpdatedAt: now()
    }));
  }

  if (["Active", "Completed"].includes(enrolment.status)) {
    await audit("CourseAccessAllowed", principal.email, enrolment.id, course.id);
    return accessResponse(enrolment, principal);
  }

  if (["Submitted", "PendingPayment"].includes(enrolment.status)) {
    const entitlement = await findActiveEntitlement(learnerEmail);
    if (entitlement) {
      enrolment = toEnrolment(await patchItem("CourseEnrollments", enrolment.id, {
        Status: "Active",
        EntitlementId: entitlement.id,
        PaymentTransactionId: entitlement.paymentTransactionId,
        ProviderReference: entitlement.providerReference,
        ActivatedAt: now(),
        UpdatedAt: now()
      }));
      await audit("CourseEnrolmentActivated", principal.email, enrolment.id, course.id);
      return accessResponse(enrolment, principal);
    }
  }

  await audit("CourseAccessDenied", principal.email, enrolment.id, course.id);
  throw new HttpError(403, `Enrolment status ${enrolment.status} does not grant course access.`);
}

export async function listAdminEnrolments(filters: { courseId?: string; status?: string; email?: string }) {
  const records = (await allItems("CourseEnrollments")).map(toEnrolment);
  const courseId = clean(filters.courseId).toUpperCase();
  const status = clean(filters.status).toLowerCase();
  const email = normalizeEmail(filters.email);
  return records
    .filter((record) => !courseId || record.courseId === courseId)
    .filter((record) => !status || record.status.toLowerCase() === status)
    .filter((record) => !email || normalizeEmail(record.learnerEmail).includes(email))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

export async function updateAdminEnrolment(
  id: string,
  input: { status?: string; notes?: string; paymentTransactionId?: string; entitlementId?: string; providerReference?: string },
  principal: Principal
) {
  const status = requireEnrolmentStatus(input.status);
  const fields: Record<string, unknown> = {
    Status: status,
    Notes: limited(input.notes, 2000),
    PaymentTransactionId: limited(input.paymentTransactionId, 160),
    EntitlementId: limited(input.entitlementId, 160),
    ProviderReference: limited(input.providerReference, 200),
    UpdatedAt: now()
  };
  if (status === "Active") fields.ActivatedAt = now();
  const enrolment = toEnrolment(await patchItem("CourseEnrollments", clean(id), fields));
  await audit("CourseEnrolmentUpdated", principal.email, enrolment.id, enrolment.courseId);
  return enrolment;
}

export async function listAdminSubscriptions(filters: { email?: string; status?: string }) {
  const email = normalizeEmail(filters.email);
  const status = clean(filters.status).toLowerCase();
  const [transactions, entitlements] = await Promise.all([
    allItems("PaymentTransactions"),
    allItems("Entitlements")
  ]);

  return {
    transactions: transactions
      .map((item) => ({ id: item.id, ...item.fields }))
      .filter((record) => !email || normalizeEmail(record.CustomerEmail).includes(email))
      .filter((record) => !status || clean(record.Status).toLowerCase() === status),
    entitlements: entitlements
      .map((item) => ({ id: item.id, ...item.fields }))
      .filter((record) => !email || normalizeEmail(record.CustomerEmail).includes(email))
      .filter((record) => !status || clean(record.Status).toLowerCase() === status)
  };
}

function requirePublishedCourse(value: unknown) {
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

function requireEnrolmentStatus(value: unknown): EnrolmentStatus {
  const status = clean(value) as EnrolmentStatus;
  const allowed: EnrolmentStatus[] = ["Submitted", "PendingPayment", "Active", "Waitlisted", "Suspended", "Cancelled", "Completed", "Rejected"];
  if (!allowed.includes(status)) throw new HttpError(400, "A valid enrolment status is required.");
  return status;
}

function normalizeGateway(value: unknown) {
  const gateway = clean(value).toLowerCase();
  if (!gateway) return "manual";
  if (!["payfast", "paypal", "manual", "none"].includes(gateway)) {
    throw new HttpError(400, "Unsupported enrolment gateway.");
  }
  return gateway;
}

function limited(value: unknown, max: number) {
  return clean(value).slice(0, max);
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

function enrolmentFields(input: {
  course: { id: PublishedCourseId; title: string };
  learnerEmail: string;
  learnerName: string;
  learnerObjectId: string;
  learnerTenantId: string;
  status: EnrolmentStatus;
  source: EnrolmentSource;
  planId: string;
  gateway: string;
  returnUrl: string;
  submittedAt: string;
  activatedAt: string;
  notes: string;
}) {
  return {
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
    PaymentTransactionId: "",
    EntitlementId: "",
    ProviderReference: "",
    ReturnUrl: input.returnUrl,
    SubmittedAt: input.submittedAt,
    ActivatedAt: input.activatedAt,
    UpdatedAt: now(),
    Notes: input.notes
  };
}

async function findLearnerCourseEnrolment(courseId: string, objectId: string, email: string) {
  const records = (await allItems("CourseEnrollments")).map(toEnrolment);
  return records.find((record) =>
    record.courseId === courseId &&
    ((objectId && record.learnerObjectId === objectId) || normalizeEmail(record.learnerEmail) === email)
  ) ?? null;
}

async function findActiveEntitlement(email: string) {
  const records = (await allItems("Entitlements")).map(toEntitlement);
  const currentTime = Date.now();
  return records.find((record) =>
    normalizeEmail(record.customerEmail) === email &&
    record.status === "Active" &&
    (!record.validUntil || Number.isNaN(Date.parse(record.validUntil)) || Date.parse(record.validUntil) > currentTime)
  ) ?? null;
}

function accessResponse(enrolment: EnrolmentRecord, principal: Principal) {
  return {
    allowed: true,
    courseId: enrolment.courseId,
    learnerId: principal.subject,
    enrolmentId: enrolment.id,
    enrolmentStatus: "active",
    returnUrl: enrolment.returnUrl || undefined
  };
}

function toEnrolment(item: GraphListItem): EnrolmentRecord {
  const fields = item.fields;
  return {
    id: item.id,
    courseId: clean(fields.CourseId).toUpperCase(),
    courseTitle: clean(fields.CourseTitle),
    learnerObjectId: clean(fields.LearnerObjectId),
    learnerTenantId: clean(fields.LearnerTenantId),
    learnerEmail: normalizeEmail(fields.LearnerEmail),
    learnerName: clean(fields.LearnerName),
    status: (clean(fields.Status) || "Submitted") as EnrolmentStatus,
    source: (clean(fields.Source) || "portal") as EnrolmentSource,
    planId: clean(fields.PlanId),
    gateway: clean(fields.Gateway),
    paymentTransactionId: clean(fields.PaymentTransactionId),
    entitlementId: clean(fields.EntitlementId),
    providerReference: clean(fields.ProviderReference),
    returnUrl: clean(fields.ReturnUrl),
    submittedAt: clean(fields.SubmittedAt),
    activatedAt: clean(fields.ActivatedAt),
    updatedAt: clean(fields.UpdatedAt),
    notes: clean(fields.Notes)
  };
}

function toEntitlement(item: GraphListItem): EntitlementRecord {
  return {
    id: item.id,
    customerEmail: normalizeEmail(item.fields.CustomerEmail),
    status: clean(item.fields.Status),
    validUntil: clean(item.fields.ValidUntil),
    paymentTransactionId: clean(item.fields.PaymentTransactionId),
    providerReference: clean(item.fields.ProviderReference)
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
    // Access and enrolment operations must not fail solely because audit storage is unavailable.
  }
}

function now() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
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
  if (siteIdCache) return siteIdCache;
  const site = await graph<{ id: string }>(`/sites/${config.sharePointHostname}:${config.sharePointSitePath}`);
  siteIdCache = site.id;
  return site.id;
}

async function listId(name: string) {
  const cached = listIdCache.get(name);
  if (cached) return cached;
  const site = await siteId();
  const result = await graph<{ value: Array<{ id: string; displayName: string }> }>(`/sites/${site}/lists?$select=id,displayName`);
  const list = result.value.find((item) => item.displayName === name);
  if (!list) throw new HttpError(500, `SharePoint list ${name} was not found. Run payment and enrolment provisioning first.`);
  listIdCache.set(name, list.id);
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
  await graph(`/sites/${site}/lists/${list}/items/${encodeURIComponent(id)}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
  return graph<GraphListItem>(`/sites/${site}/lists/${list}/items/${encodeURIComponent(id)}?expand=fields`);
}

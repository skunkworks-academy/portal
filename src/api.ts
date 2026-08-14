import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { apiScope } from "./authConfig";
import type { ApplicationRecord, ClassInput, ClassRegistrationRecord, ClassSession, CourseRecord, JobInput, JobPosting, NewApplication, OnboardingTask, PortalHealth, PortalProfile, PortalProfileInput, PortalRole } from "./types";

const productionApiBaseUrl = "https://api.skunkworksacademy.com/api";
const localApiBaseUrl = "http://localhost:8080/api";

function defaultApiBaseUrl() {
  if (typeof window === "undefined") return productionApiBaseUrl;
  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? localApiBaseUrl : productionApiBaseUrl;
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = (configuredApiBaseUrl || defaultApiBaseUrl()).replace(/\/$/, "");

async function getAccessToken(instance: IPublicClientApplication, account: AccountInfo) {
  const result = await instance.acquireTokenSilent({
    account,
    scopes: [apiScope]
  });
  return result.accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth?: { instance: IPublicClientApplication; account: AccountInfo }
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    headers.set("Authorization", `Bearer ${await getAccessToken(auth.instance, auth.account)}`);
  }

  const requestUrl = `${apiBaseUrl}${path}`;
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      ...options,
      headers
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Network request failed";
    throw new Error(`The Portal API could not be reached at ${requestUrl}. ${reason}`);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Portal API request failed with ${response.status} at ${requestUrl}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  const body = await response.text();
  if (!body.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Portal API returned invalid JSON at ${requestUrl}`);
  }
}

export const portalApi = {
  health: () => request<PortalHealth>("/health"),
  jobs: () => request<JobPosting[]>("/jobs"),
  courses: () => request<CourseRecord[]>("/courses"),
  classes: () => request<ClassSession[]>("/classes"),
  registerClass: (id: string, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassRegistrationRecord>(`/classes/${id}/register`, { method: "POST" }, auth),
  assignInstructor: (id: string, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassSession>(`/classes/${id}/assign-instructor`, { method: "POST" }, auth),
  myClasses: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassRegistrationRecord[]>("/me/classes", {}, auth),
  myProfile: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<PortalProfile | null>("/me/profile", {}, auth),
  updateProfile: (payload: PortalProfileInput, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<PortalProfile>("/me/profile", { method: "PATCH", body: JSON.stringify(payload) }, auth),
  adminProfiles: (auth: { instance: IPublicClientApplication; account: AccountInfo }, role?: PortalRole) =>
    request<PortalProfile[]>(`/admin/profiles${role ? `?role=${encodeURIComponent(role)}` : ""}`, {}, auth),
  adminClassRegistrations: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassRegistrationRecord[]>("/admin/class-registrations", {}, auth),
  createClass: (payload: ClassInput, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassSession>("/admin/classes", { method: "POST", body: JSON.stringify(payload) }, auth),
  updateClass: (id: string, payload: Partial<ClassInput>, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassSession>(`/admin/classes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, auth),
  submitApplication: (
    payload: NewApplication,
    auth: { instance: IPublicClientApplication; account: AccountInfo }
  ) => request<ApplicationRecord>("/applications", { method: "POST", body: JSON.stringify(payload) }, auth),
  myApplications: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ApplicationRecord[]>("/me/applications", {}, auth),
  adminApplications: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ApplicationRecord[]>("/admin/applications", {}, auth),
  updateApplication: (
    id: string,
    payload: Partial<Pick<ApplicationRecord, "status" | "owner">>,
    auth: { instance: IPublicClientApplication; account: AccountInfo }
  ) => request<ApplicationRecord>(`/admin/applications/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, auth),
  adminJobs: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<JobPosting[]>("/admin/jobs", {}, auth),
  createJob: (payload: JobInput, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<JobPosting>("/admin/jobs", { method: "POST", body: JSON.stringify(payload) }, auth),
  updateJob: (
    id: string,
    payload: Partial<JobInput>,
    auth: { instance: IPublicClientApplication; account: AccountInfo }
  ) => request<JobPosting>(`/admin/jobs/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, auth),
  adminTasks: (auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<OnboardingTask[]>("/admin/tasks", {}, auth),
  updateTask: (
    id: string,
    payload: Partial<OnboardingTask>,
    auth: { instance: IPublicClientApplication; account: AccountInfo }
  ) => request<OnboardingTask>(`/admin/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, auth)
};
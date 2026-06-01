import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { apiScope } from "./authConfig";
import type { ApplicationRecord, ClassInput, ClassRegistrationRecord, ClassSession, CourseRecord, JobInput, JobPosting, NewApplication, OnboardingTask, PortalHealth, PortalProfile, PortalProfileInput, PortalRole } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

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
  headers.set("Content-Type", "application/json");

  if (auth) {
    headers.set("Authorization", `Bearer ${await getAccessToken(auth.instance, auth.account)}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const portalApi = {
  health: () => request<PortalHealth>("/health"),
  jobs: () => request<JobPosting[]>("/jobs"),
  courses: () => request<CourseRecord[]>("/courses"),
  classes: () => request<ClassSession[]>("/classes"),
  registerClass: (id: string, auth: { instance: IPublicClientApplication; account: AccountInfo }) =>
    request<ClassRegistrationRecord>(`/classes/${id}/register`, { method: "POST" }, auth),
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

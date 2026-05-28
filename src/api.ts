import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { apiScope } from "./authConfig";
import type { ApplicationRecord, JobInput, JobPosting, NewApplication, OnboardingTask } from "./types";

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
  jobs: () => request<JobPosting[]>("/jobs"),
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

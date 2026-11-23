import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { apiScope } from "./authConfig";

export const careerStatuses = ["Saved", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"] as const;
export type CareerStatus = typeof careerStatuses[number];
export type CareerApplication = {
  id: string; title: string; employer: string; url: string;
  status: CareerStatus; createdAt: string; updatedAt: string;
};
type Auth = { instance: IPublicClientApplication; account: AccountInfo };

function baseUrl() {
  const local = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return (import.meta.env.VITE_API_BASE_URL?.trim() || (local ? "/api" : "https://api.skunkworksacademy.com/api")).replace(/\/$/, "");
}

async function careerRequest<T>(path: string, auth: Auth, method = "GET", payload?: unknown): Promise<T> {
  const token = await auth.instance.acquireTokenSilent({ scopes: [apiScope], account: auth.account });
  const response = await fetch(baseUrl() + "/me/career/applications" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token.accessToken,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
  if (!response.ok) throw new Error("Career tracker request failed (" + response.status + "). " + (await response.text()).slice(0, 250));
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export const careerApi = {
  list: (auth: Auth) => careerRequest<CareerApplication[]>("", auth),
  create: (record: { title: string; employer: string; url: string }, auth: Auth) =>
    careerRequest<CareerApplication>("", auth, "POST", record),
  update: (id: string, status: CareerStatus, auth: Auth) =>
    careerRequest<CareerApplication>("/" + encodeURIComponent(id), auth, "PATCH", { status }),
  remove: (id: string, auth: Auth) =>
    careerRequest<void>("/" + encodeURIComponent(id), auth, "DELETE")
};

import { HttpError } from "./http.js";

export const careerStatuses = ["Saved", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"] as const;
export type CareerStatus = typeof careerStatuses[number];
export type CareerApplication = {
  id: string;
  title: string;
  employer: string;
  url: string;
  status: CareerStatus;
  createdAt: string;
  updatedAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function limitedText(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string") throw new HttpError(400, label + " is required.");
  const result = value.trim();
  if (result.length < 2 || result.length > maximum || /[\x00-\x1f\x7f]/.test(result)) {
    throw new HttpError(400, label + " must contain 2–" + maximum + " printable characters.");
  }
  return result;
}

function httpsUrl(value: unknown) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 2000) throw new HttpError(400, "Invalid job URL.");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new HttpError(400, "Enter a valid HTTPS job URL."); }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) {
    throw new HttpError(400, "A public HTTPS job URL is required.");
  }
  return url.toString();
}

export function validateCareerCreate(value: unknown) {
  if (!isObject(value) || Object.keys(value).some(key => !["title", "employer", "url"].includes(key))) {
    throw new HttpError(400, "Invalid career application.");
  }
  return {
    title: limitedText(value.title, "Position", 140),
    employer: limitedText(value.employer, "Employer", 120),
    url: httpsUrl(value.url)
  };
}

export function validateCareerStatus(value: unknown): CareerStatus {
  if (!isObject(value) || Object.keys(value).length !== 1 || !careerStatuses.includes(value.status as CareerStatus)) {
    throw new HttpError(400, "Invalid career application status.");
  }
  return value.status as CareerStatus;
}

export function validateCareerId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, "Invalid career application identifier.");
  }
  return id.toLowerCase();
}

import { PortalApiError } from "./api-error";

type LearningService = "lms" | "idr" | "assessment" | "skunkie";
const names: Record<LearningService, string> = {
  lms: "Academy learning records", idr: "your private IDR",
  assessment: "your learner assessment", skunkie: "Skunkie"
};

export function learningErrorMessage(error: unknown, service: LearningService): string {
  const status = error instanceof PortalApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : "";
  if (status === 401 || (!status && /interaction_required|token|\b401\b/i.test(message))) {
    return "Your Microsoft session needs attention. Sign in again to continue.";
  }
  if (status === 403 || (!status && /membership.*not provisioned|forbidden|\b403\b/i.test(message))) {
    return `Access to ${names[service]} was denied for this Microsoft account. Contact Academy support to check your access.`;
  }
  if (status === 429) return "The learning service is receiving too many requests. Try again shortly.";
  if (status === 503 || (!status && /storage is not configured|database unavailable|\b503\b/i.test(message))) {
    return service === "skunkie"
      ? "Skunkie is not ready on the Academy server. An administrator needs to check its Azure AI configuration."
      : `The service for ${names[service]} is unavailable. Try again later or contact Academy support.`;
  }
  return `The request for ${names[service]} could not be completed. Try again or contact Academy support.`;
}

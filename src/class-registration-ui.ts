import { PortalApiError } from "./api-error";
import type { ClassRegistrationRecord, ClassSession } from "./types";

export type ClassRegistrationFeedback = {
  classId: string;
  type: "success" | "error";
  message: string;
};

/** Choose an honest action for the persisted class and the current learner's registration. */
export function classRegistrationAction(
  classSession: ClassSession,
  registration: ClassRegistrationRecord | undefined,
  submitting = false
) {
  if (registration) {
    // Cancelled rows are still returned by the current SharePoint API. It
    // does not reactivate them on a repeat POST, so never claim re-enrolment.
    return {
      kind: "details" as const,
      label: registration.status === "Cancelled"
        ? "Cancelled · View details"
        : registration.status === "Waitlisted"
          ? "Waitlisted · View details"
          : "Registered · View details",
      disabled: false
    };
  }

  if (submitting) {
    return { kind: "register" as const, label: "Registering…", disabled: true };
  }

  // The SharePoint API accepts Scheduled and Open classes only. Do not
  // advertise a waitlist for Full classes: that route rejects them with 409.
  if (classSession.status !== "Scheduled" && classSession.status !== "Open") {
    return {
      kind: "unavailable" as const,
      label: classSession.status === "Full" ? "Class full" : "Registration closed",
      disabled: true
    };
  }
  return { kind: "register" as const, label: "Register", disabled: false };
}

export function classRegistrationFailureMessage(caught: unknown) {
  if (caught instanceof PortalApiError) {
    if (caught.status === 404) return "This class is no longer available. Refresh the schedule to choose another class.";
    if (caught.status === 409) return "Registration is closed or the class has filled. Refresh the schedule for its latest status.";
    if (caught.status === 401 || caught.status === 403) return "Your account is not authorised to register for this class. Sign in with a learner account or contact the Academy.";
  }
  return caught instanceof Error ? caught.message : "Registration could not be completed. Please try again.";
}

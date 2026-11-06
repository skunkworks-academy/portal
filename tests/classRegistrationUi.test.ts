import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PortalApiError } from "../src/api-error";
import { classRegistrationAction, classRegistrationFailureMessage, classRegistrationResultFeedback } from "../src/class-registration-ui";
import type { ClassSession, ClassRegistrationRecord } from "../src/types";

const classSession: ClassSession = {
  id: "real-class-1",
  courseId: "ai-tools",
  courseTitle: "Applied AI Tools",
  title: "AI Tools June Cohort",
  schedule: "Tue and Thu, 18:00",
  modality: "Hybrid",
  instructor: "Pending assignment",
  seats: 24,
  enrolled: 2,
  status: "Open"
};

const registration: ClassRegistrationRecord = {
  id: "registration-1",
  classId: classSession.id,
  classTitle: classSession.title,
  courseId: classSession.courseId,
  courseTitle: classSession.courseTitle,
  studentName: "Learner",
  studentEmail: "learner@example.test",
  studentObjectId: "learner-object",
  status: "Registered",
  registeredAt: "2026-06-01T16:00:00Z"
};

describe("student class registration actions", () => {
  it("offers a real registration action for open and scheduled classes", () => {
    expect(classRegistrationAction(classSession, undefined)).toEqual({ kind: "register", label: "Register", disabled: false });
    expect(classRegistrationAction({ ...classSession, status: "Scheduled" }, undefined).disabled).toBe(false);
  });

  it("indicates pending submission and prevents duplicate clicks", () => {
    expect(classRegistrationAction(classSession, undefined, true)).toEqual({ kind: "register", label: "Registering…", disabled: true });
  });

  it("makes existing registrations and waitlists navigable without posting again", () => {
    expect(classRegistrationAction(classSession, registration)).toEqual({ kind: "details", label: "Registered · View details", disabled: false });
    expect(classRegistrationAction(classSession, { ...registration, status: "Waitlisted" }).kind).toBe("details");
    expect(classRegistrationAction(classSession, { ...registration, status: "Cancelled" })).toEqual({ kind: "details", label: "Cancelled · View details", disabled: false });
  });

  it("never confirms an existing cancelled registration after the API responds", () => {
    expect(classRegistrationResultFeedback({ ...registration, status: "Cancelled" })).toMatchObject({
      type: "error",
      message: expect.stringContaining("cannot be reactivated")
    });
    expect(classRegistrationResultFeedback(registration).type).toBe("success");
    expect(classRegistrationResultFeedback({ ...registration, status: "Waitlisted" }).message).toContain("waitlist");
  });

  it("does not falsely offer an unavailable backend waitlist", () => {
    expect(classRegistrationAction({ ...classSession, status: "Full" }, undefined)).toEqual({ kind: "unavailable", label: "Class full", disabled: true });
    for (const status of ["InProgress", "Complete", "Cancelled"] as const) {
      expect(classRegistrationAction({ ...classSession, status }, undefined).disabled).toBe(true);
    }
  });

  it("maps API failures to visible, actionable messages", () => {
    expect(classRegistrationFailureMessage(new PortalApiError(404, "Class not found"))).toMatch(/no longer available/);
    expect(classRegistrationFailureMessage(new PortalApiError(409, "Closed"))).toMatch(/Registration is closed/);
    expect(classRegistrationFailureMessage(new Error("Network failed"))).toBe("Network failed");
  });

  it("keeps the API POST wired to the student Classes button and surfaces errors", () => {
    const student = readFileSync(new URL("../src/student-experience.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    expect(student).toContain("onRegister(classItem.id)");
    expect(student).toContain("registrationFeedback?.classId === classItem.id");
    expect(student).toContain("role={registrationFeedback.type === \"error\" ? \"alert\" : \"status\"}");
    expect(app).toContain("await portalApi.registerClass(classId, auth)");
    expect(app).toContain("registrationBusyClassId={registrationBusyClassId}");
  });
});

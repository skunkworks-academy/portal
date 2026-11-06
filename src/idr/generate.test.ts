import { describe, expect, it } from "vitest";
import { generateDraftRoadmap } from "./generate";
import type { IdRAssessment, IdRRoleTemplate } from "./model";

const template: IdRRoleTemplate = {
  id: "security-analyst-v1",
  roleTitle: "Security Analyst",
  competencies: [
    { competencyId: "networks", label: "Networking", expectedLevel: 2, evidenceRequired: "Network diagram and lab report" },
    { competencyId: "incident-response", label: "Incident response", expectedLevel: 3, evidenceRequired: "Tabletop exercise report" }
  ]
};
const input: IdRAssessment = {
  schemaVersion: 1,
  assessmentId: "example-1",
  learnerSubject: "subject-from-verified-token",
  submittedAt: "2026-11-04T10:00:00.000Z",
  source: "skunkie",
  consentToStore: true,
  targetRole: "Security Analyst",
  weeklyStudyHours: 5,
  interests: [],
  competencies: [{ competencyId: "networks", level: 2, confidence: "self_reported" }]
};
describe("IDR draft generator", () => {
  it("generates explicit gaps without fabricating a verified score", () => {
    const result = generateDraftRoadmap(input, template, new Date("2026-11-04T12:00:00.000Z"));
    expect(result.strengths).toEqual(["Networking"]);
    expect(result.skillGaps).toEqual(["Incident response"]);
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].status).toBe("not_started");
    expect(result.reviewState).toBe("draft");
    expect(result.learnerSubject).toBe(input.learnerSubject);
  });
  it("refuses consent-less persistence", () => {
    expect(() => generateDraftRoadmap({ ...input, consentToStore: false }, template)).toThrow("consent");
  });
  it("rejects invalid evidence and duplicate competencies", () => {
    expect(() => generateDraftRoadmap({ ...input, competencies: [{ competencyId: "networks", level: 9, confidence: "self_reported" }] }, template)).toThrow();
    expect(() => generateDraftRoadmap({ ...input, competencies: [...input.competencies, ...input.competencies] }, template)).toThrow("Duplicate");
  });
  it("is deterministic for an assessment and generation instant", () => {
    const now = new Date("2026-11-04T12:00:00.000Z");
    expect(generateDraftRoadmap(input, template, now)).toEqual(generateDraftRoadmap(input, template, now));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { createLearnerJourney, type JourneyInput } from "../src/learner-assessment/journey.js";
import { HttpError } from "../api/http.js";

const mocks = vi.hoisted(() => ({
  routes: new Map<string, { handler: (request: HttpRequest) => Promise<HttpResponseInit> }>(),
  requireUser: vi.fn(), get: vi.fn(), put: vi.fn()
}));
vi.mock("@azure/functions", () => ({ app: { http: (name: string, route: never) => mocks.routes.set(name, route) } }));
vi.mock("../api/auth.js", () => ({ requireUser: mocks.requireUser }));
vi.mock("../api/lmsCosmosStore.js", () => ({ CosmosLmsStore: class { get = mocks.get; put = mocks.put; } }));
import { validateSkunkieAssessment } from "../api/skunkieAssessmentFunctions.js";

const journey: JourneyInput = {
  version: 1,
  workspaceConfiguration: { sessionMinutes: 30, difficulty: "standard", helpLevel: "guided", preferredOrder: "practice-first", practiceProportion: 75 },
  checkAnswers: [
    { questionId: "unexpected-sign-in-link", questionVersion: 1, answerId: "trusted-route" },
    { questionId: "one-change-at-a-time", questionVersion: 1, answerId: "not-sure" }
  ]
};
const assessment = {
  schemaVersion: 1, assessmentId: "assessment-test", consentToStore: true,
  studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30,
  selfRatedConfidence: 3, interests: [], supportNeeds: []
};

describe("versioned learner journey", () => {
  it("keeps self-selected configuration and records only the observed example answers", () => {
    const result = createLearnerJourney(journey);
    expect(result.workspaceConfiguration).toEqual(journey.workspaceConfiguration);
    expect(result.checkEvidence.map(a => a.outcome)).toEqual(["correct", "not-sure"]);
    expect(result.rationale.join(" ")).toContain("do not measure aptitude");
    expect(result.rationale.join(" ")).toContain("difficulty has not been changed");
    expect(createLearnerJourney(result)).toEqual(result);
  });
  it("recomputes feedback and strips invented outcomes and ability claims", () => {
    const input = { ...journey, checkEvidence: [{ outcome: "correct" }], rationale: ["Expert"], aptitude: "expert",
      checkAnswers: [{ questionId: "unexpected-sign-in-link", questionVersion: 1, answerId: "follow-link", outcome: "correct" }] };
    const result = createLearnerJourney(input);
    expect(result.checkEvidence[0].outcome).toBe("review");
    expect(result).not.toHaveProperty("aptitude");
    expect(result.rationale).not.toContain("Expert");
    expect(result.checkAnswers[0]).not.toHaveProperty("outcome");
  });
  it.each([
    { sessionMinutes: "30" }, { difficulty: "expert" }, { helpLevel: "none" },
    { preferredOrder: "unknown" }, { practiceProportion: 101 }
  ])("rejects unsupported configuration %j", invalid => {
    expect(() => createLearnerJourney({ ...journey, workspaceConfiguration: { ...journey.workspaceConfiguration, ...invalid } })).toThrow();
  });
  it.each([
    [{ questionId: "unknown", questionVersion: 1, answerId: "trusted-route" }],
    [{ questionId: "unexpected-sign-in-link", questionVersion: 2, answerId: "trusted-route" }],
    [{ questionId: "unexpected-sign-in-link", questionVersion: 1, answerId: "made-up" }],
    [journey.checkAnswers[0], journey.checkAnswers[0]]
  ])("rejects unknown, stale or duplicate answers", (...answers) => {
    expect(() => createLearnerJourney({ ...journey, checkAnswers: answers })).toThrow();
  });
  it("accepts skipping examples and preserves the original assessment schema and consent", () => {
    expect(createLearnerJourney({ ...journey, checkAnswers: [] }).checkEvidence).toEqual([]);
    expect(validateSkunkieAssessment(assessment)).not.toHaveProperty("journey");
    expect(() => validateSkunkieAssessment({ ...assessment, consentToStore: false, journey })).toThrow();
    expect(() => validateSkunkieAssessment({ ...assessment, journey: { ...journey, version: 2 } })).toThrow();
  });
});

describe("private journey persistence", () => {
  beforeEach(() => {
    vi.stubEnv("ENTRA_TENANT_ID", "home-tenant");
    vi.stubEnv("LMS_HOME_ORGANIZATION_ID", "academy");
    vi.stubEnv("LMS_COSMOS_ENDPOINT", "https://example.documents.azure.com");
    vi.stubEnv("LMS_COSMOS_DATABASE", "academy");
    vi.stubEnv("LMS_COSMOS_CONTAINER", "lms");
    mocks.requireUser.mockResolvedValue({ tenantId: "home-tenant", subject: "verified-learner", roles: [] });
    mocks.get.mockResolvedValue(null);
    mocks.put.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
  const save = (payload: unknown) => mocks.routes.get("skunkieLearnerAssessmentSave")!.handler({ headers: new Headers(), json: async () => payload } as HttpRequest);

  it("persists the canonical journey under the verified identity, not submitted identity", async () => {
    const response = await save({ ...assessment, journey, learnerSubject: "other-user", updatedAt: "forged" });
    expect(response.status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith("skunkie-assessment-v1", "academy:verified-learner", expect.objectContaining({
      learnerSubject: "verified-learner", aptitudeEvidence: [], assessment: expect.objectContaining({ journey: createLearnerJourney(journey) })
    }));
    expect((response.jsonBody as { updatedAt: string }).updatedAt).not.toBe("forged");
  });
  it("preserves saved journey choices when the older questionnaire omits them", async () => {
    const savedJourney = createLearnerJourney(journey);
    mocks.get.mockResolvedValue({ assessment: { ...assessment, journey: savedJourney } });
    expect((await save(assessment)).status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith("skunkie-assessment-v1", "academy:verified-learner", expect.objectContaining({ assessment: expect.objectContaining({ journey: savedJourney }) }));
  });
  it("does not write after validation, consent or authentication failure", async () => {
    expect((await save({ ...assessment, journey: { ...journey, version: 99 } })).status).toBe(400);
    expect((await save({ ...assessment, consentToStore: false, journey })).status).toBe(400);
    mocks.requireUser.mockRejectedValue(new HttpError(403, "Access denied"));
    expect((await save({ ...assessment, journey })).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("keeps a failed persistence attempt as an error, never a successful save", async () => {
    mocks.put.mockRejectedValue(new HttpError(503, "LMS database unavailable."));
    expect((await save({ ...assessment, journey })).status).toBe(503);
  });
});

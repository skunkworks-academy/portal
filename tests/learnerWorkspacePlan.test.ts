import { describe, expect, it } from "vitest";
import { buildLearnerWorkspacePlan } from "../src/LearnerWorkspacePlan";
import { createLearnerJourney } from "../src/learner-assessment/journey";
import type { SkunkieLearnerProfile } from "../src/learner-assessment/model";
const profile: SkunkieLearnerProfile = { schemaVersion: 1, learnerSubject: "test", updatedAt: "2026-11-05", aptitudeEvidence: [], assessment: {
  schemaVersion: 1, assessmentId: "assessment-test", updatedAt: "2026-11-05", consentToStore: true, studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30, selfRatedConfidence: 3, interests: ["network"], supportNeeds: [],
  journey: createLearnerJourney({ version: 1, workspaceConfiguration: { sessionMinutes: 30, difficulty: "foundation", helpLevel: "hints", preferredOrder: "practice-first", practiceProportion: 75 }, checkAnswers: [] })
} };
const course = { courseId: "real-metadata-id", title: "Networking basics", category: "Networking", level: "Beginner", estimatedEffort: "4 hours", courseUrl: "https://www.skunkworksacademy.com/courses/networking/" };
describe("configured learner workspace", () => {
  it("uses saved order, help and time allocation and explains real metadata matches", () => {
    const plan = buildLearnerWorkspacePlan(profile, [course])!;
    expect(plan.order).toEqual(["practice", "concept"]); expect(plan.practiceMinutes + plan.conceptMinutes).toBe(30);
    expect(plan.configuration.helpLevel).toBe("hints"); expect(plan.matches[0].course).toBe(course); expect(plan.matches[0].reason).toContain("network");
  });
  it("never fills empty matches with unrelated or unsafe catalogue records", () => {
    const plan = buildLearnerWorkspacePlan(profile, [{ ...course, title: "Cooking basics", category: "Cooking" }, { ...course, courseUrl: "javascript:alert(1)" }])!;
    expect(plan.matches).toHaveLength(0);
  });
  it("requires a saved journey configuration", () => {
    expect(buildLearnerWorkspacePlan({ ...profile, assessment: { ...profile.assessment, journey: undefined } }, [course])).toBeNull();
  });
});

import type { LearnerJourney } from "./journey.js";

/** Skunkie learner assessment: distinct from career-development/IDR assessment. */
export interface SkunkieLearnerAssessment {
  schemaVersion: 1;
  assessmentId: string;
  updatedAt: string;
  consentToStore: boolean;
  studyGoal: "explore" | "career" | "certification" | "skills";
  preferredApproaches: Array<"hands_on" | "examples" | "reading" | "discussion" | "video">;
  preferredSessionMinutes: 15 | 30 | 60;
  selfRatedConfidence: 1 | 2 | 3 | 4 | 5;
  interests: string[];
  supportNeeds: string[];
  language?: string;
  notes?: string;
  /** Optional v1 workspace choices and authored practice-check evidence. */
  journey?: LearnerJourney;
}
export interface SkunkieLearnerProfile {
  schemaVersion: 1;
  learnerSubject: string;
  assessment: SkunkieLearnerAssessment;
  updatedAt: string;
  /** No aptitude or ability verdict without demonstrated, validated assessment evidence. */
  aptitudeEvidence: [];
}

/** Skunkie IDR v1: structured, reviewable learner assessments and roadmaps. */
export type Confidence = "self_reported" | "assessed" | "verified";
export type MilestoneStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type ReviewState = "draft" | "awaiting_review" | "approved";

export interface CompetencyEvidence {
  competencyId: string;
  level: number; // 0-4: none, awareness, working, proficient, advanced
  confidence: Confidence;
  evidenceReference?: string; // pointer only; do not store sensitive evidence in Git
}

export interface IdRAssessment {
  schemaVersion: 1;
  assessmentId: string;
  learnerSubject: string; // derived by backend from verified Entra token; never trust client value
  submittedAt: string;
  source: "skunkie" | "microsoft_forms_import" | "staff_import";
  consentToStore: boolean;
  currentRole?: string;
  targetRole: string;
  weeklyStudyHours: number;
  targetDate?: string;
  interests: string[];
  competencies: CompetencyEvidence[];
  aspirations?: string;
}

export interface IdRMilestone {
  id: string;
  title: string;
  description: string;
  competencyId?: string;
  horizonDays: 30 | 60 | 90 | 365;
  status: MilestoneStatus;
  evidenceRequired: string;
  dueDate?: string;
  completedAt?: string;
}

export interface IdRRoadmap {
  schemaVersion: 1;
  roadmapId: string;
  assessmentId: string;
  learnerSubject: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  reviewState: ReviewState;
  targetRole: string;
  strengths: string[];
  skillGaps: string[];
  milestones: IdRMilestone[];
  recommendations: Array<{
    competencyId: string;
    kind: "course" | "lab" | "certification" | "project" | "mentoring";
    title: string;
    catalogueId?: string;
    rationale: string;
  }>;
  author: "rules_v1" | "skunkie_ai" | "staff";
  reviewerSubject?: string;
}

export interface IdRCompetencyTarget {
  competencyId: string;
  label: string;
  expectedLevel: number;
  evidenceRequired: string;
}

/** Versioned role templates come from the Academy catalogue, not an AI guess. */
export interface IdRRoleTemplate {
  id: string;
  roleTitle: string;
  competencies: IdRCompetencyTarget[];
}

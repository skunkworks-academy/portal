export type NetworkSkill = "addressing" | "switching" | "troubleshooting";
export type KnowledgeQuestion = { id: string; skill: NetworkSkill; prompt: string; options: string[] };
export type CurriculumBinding = {
  courseId: string;
  companionId: "networking";
  catalogueTitle: "Networking Basics";
  version: 1;
  lessonIds: Record<NetworkSkill, string>;
};
export type LearningActivity = {
  skill: NetworkSkill; title: string; explanation: string; steps: string[];
  lessonId: string; minutes: number; check: KnowledgeQuestion;
};
export type LearningOutcome = { id: string; sessionId: string; at: string; correct: boolean; nextStep: string };
export type LearningSession = {
  schemaVersion: 1;
  curriculum: CurriculumBinding;
  id: string; courseId: string; createdAt: string; goal: string;
  assessment: { percent: number; skillResults: Record<NetworkSkill, boolean> };
  activity: LearningActivity;
  context: { profileUpdatedAt: string | null; completedLessonCount: number; priorOutcomeCount: number; approach: string };
};
export type SkunkieContext = {
  learner: { name: string };
  courses: Array<{ id: string; title: string; binding: CurriculumBinding }>;
  questions: KnowledgeQuestion[];
  sessions: LearningSession[];
  outcomes: LearningOutcome[];
  inputModes: ["text"];
};

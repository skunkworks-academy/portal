/** Brief practice examples with transparent feedback, not an aptitude test. */
export const journeyQuestions = [
  {
    id: "unexpected-sign-in-link", version: 1,
    prompt: "An unexpected message asks you to sign in urgently using its link. What is a sensible first step?",
    options: [
      { id: "trusted-route", label: "Open the service using a trusted address or saved bookmark and check there." },
      { id: "follow-link", label: "Use the message's link because the request sounds urgent." },
      { id: "share-password", label: "Reply with my password so the sender can check." },
      { id: "not-sure", label: "I'm not sure — show me an explanation." }
    ],
    correctAnswerId: "trusted-route",
    explanation: "An unexpected link can imitate a real sign-in page. Open the service through a trusted route and check the request before sharing any information.",
    source: { title: "Microsoft Support: Protect yourself from online scams and attacks", url: "https://support.microsoft.com/en-us/support/protect-yourself-from-online-scams-and-attacks" }
  },
  {
    id: "one-change-at-a-time", version: 1,
    prompt: "A practice task keeps failing. Which next step helps you understand the cause?",
    options: [
      { id: "inspect-and-test", label: "Read the error, make one relevant safe change, then retry and compare." },
      { id: "change-everything", label: "Change several settings at once so something might work." },
      { id: "skip-protection", label: "Turn off the protection that is blocking the task." },
      { id: "not-sure", label: "I'm not sure — show me an explanation." }
    ],
    correctAnswerId: "inspect-and-test",
    explanation: "A single relevant change makes it easier to compare results and understand what helped. Keep protections in place and ask for help when the error or a proposed change is unclear.",
    source: { title: "IBM: General debugging tips", url: "https://www.ibm.com/docs/en/pli-for-aix/3.1.0?topic=programs-general-debugging-tips" }
  }
] as const;

export interface JourneyWorkspaceConfiguration {
  sessionMinutes: 15 | 30 | 60;
  difficulty: "foundation" | "standard" | "stretch";
  helpLevel: "guided" | "hints" | "independent";
  preferredOrder: "concept-first" | "practice-first";
  practiceProportion: 25 | 50 | 75;
}
export interface JourneyCheckAnswer { questionId: string; questionVersion: 1; answerId: string }
export interface JourneyInput {
  version: 1;
  workspaceConfiguration: JourneyWorkspaceConfiguration;
  checkAnswers: JourneyCheckAnswer[];
}
export interface LearnerJourney extends JourneyInput {
  checkEvidence: Array<JourneyCheckAnswer & { outcome: "correct" | "review" | "not-sure" }>;
  rationale: string[];
}

function choice<T extends string | number>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error("Invalid workspace configuration choice.");
  return value as T;
}

/** Canonicalize user choices and recompute evidence; never trust client outcomes. */
export function createLearnerJourney(input: unknown): LearnerJourney {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid learner journey.");
  const value = input as Record<string, unknown>;
  if (value.version !== 1) throw new Error("Unsupported learner journey version.");
  const config = value.workspaceConfiguration;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid workspace configuration.");
  const c = config as Record<string, unknown>;
  const workspaceConfiguration: JourneyWorkspaceConfiguration = {
    sessionMinutes: choice(c.sessionMinutes, [15, 30, 60] as const),
    difficulty: choice(c.difficulty, ["foundation", "standard", "stretch"] as const),
    helpLevel: choice(c.helpLevel, ["guided", "hints", "independent"] as const),
    preferredOrder: choice(c.preferredOrder, ["concept-first", "practice-first"] as const),
    practiceProportion: choice(c.practiceProportion, [25, 50, 75] as const)
  };
  if (!Array.isArray(value.checkAnswers) || value.checkAnswers.length > journeyQuestions.length) throw new Error("Invalid practice check answers.");
  const seen = new Set<string>();
  const checkEvidence: LearnerJourney["checkEvidence"] = value.checkAnswers.map(inputAnswer => {
    if (!inputAnswer || typeof inputAnswer !== "object" || Array.isArray(inputAnswer)) throw new Error("Invalid practice check answer.");
    const answer = inputAnswer as Record<string, unknown>;
    const question = journeyQuestions.find(q => q.id === answer.questionId && q.version === answer.questionVersion);
    if (!question || seen.has(question.id) || !question.options.some(option => option.id === answer.answerId)) throw new Error("Unknown or duplicate practice check answer.");
    seen.add(question.id);
    const answerId = answer.answerId as string;
    return { questionId: question.id, questionVersion: question.version, answerId,
      outcome: answerId === "not-sure" ? "not-sure" : answerId === question.correctAnswerId ? "correct" : "review" };
  });
  const rationale = [
    `You chose ${workspaceConfiguration.sessionMinutes}-minute sessions and ${workspaceConfiguration.difficulty} difficulty.`,
    `You chose ${workspaceConfiguration.helpLevel} help, ${workspaceConfiguration.preferredOrder} ordering and ${workspaceConfiguration.practiceProportion}% practice.`,
    "These choices can be changed. Brief practice examples do not measure aptitude or certify competence."
  ];
  if (checkEvidence.some(answer => answer.outcome !== "correct")) rationale.push("Review the practice explanations with guidance when useful; your chosen difficulty has not been changed.");
  return {
    version: 1, workspaceConfiguration,
    checkAnswers: checkEvidence.map(({ questionId, questionVersion, answerId }) => ({ questionId, questionVersion, answerId })),
    checkEvidence, rationale
  };
}

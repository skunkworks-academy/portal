/** Validated presentation preferences, never a diagnosis of a fixed learning style. */
export type LearningFocus = "cloud" | "cybersecurity" | "ai" | "it" | "exploring";
export type LearningGoal = "certification" | "career" | "skills" | "exploration";
export type LearningFormat = "practice" | "visual" | "reading" | "guided";
export type LearningPace = "15" | "30" | "60";
export type LearningPalette = "navy" | "teal" | "amber" | "contrast";
export type LearningTextSize = "standard" | "large";

export interface LearnerPreferences {
  version: 1;
  focus: LearningFocus;
  goal: LearningGoal;
  format: LearningFormat;
  pace: LearningPace;
  palette: LearningPalette;
  textSize: LearningTextSize;
  reduceMotion: boolean;
  confidence: 1 | 2 | 3;
}

export const defaultLearnerPreferences: LearnerPreferences = {
  version: 1,
  focus: "exploring",
  goal: "skills",
  format: "guided",
  pace: "30",
  palette: "navy",
  textSize: "standard",
  reduceMotion: false,
  confidence: 1
};

export const focusLabels: Record<LearningFocus, string> = {
  cloud: "Cloud and infrastructure",
  cybersecurity: "Cybersecurity",
  ai: "AI and automation",
  it: "IT foundations",
  exploring: "Help me explore"
};

export const formatLabels: Record<LearningFormat, string> = {
  practice: "Hands-on exercises first",
  visual: "Diagrams and demonstrations first",
  reading: "Reading and reference material first",
  guided: "Guided, step-by-step explanations"
};

const allowed = {
  focus: ["cloud", "cybersecurity", "ai", "it", "exploring"],
  goal: ["certification", "career", "skills", "exploration"],
  format: ["practice", "visual", "reading", "guided"],
  pace: ["15", "30", "60"],
  palette: ["navy", "teal", "amber", "contrast"],
  textSize: ["standard", "large"],
  confidence: [1, 2, 3]
} as const;

/** Fail closed for unrecognised values; do not allow user-defined CSS, HTML or arbitrary prompts. */
export function validateLearnerPreferences(input: unknown): LearnerPreferences | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const p = input as Record<string, unknown>;
  const has = (field: keyof typeof allowed) =>
    (allowed[field] as readonly unknown[]).includes(p[field]);
  if (p.version !== 1 || !has("focus") || !has("goal") || !has("format") ||
      !has("pace") || !has("palette") || !has("textSize") || !has("confidence") ||
      typeof p.reduceMotion !== "boolean") return null;
  return {
    version: 1,
    focus: p.focus as LearningFocus,
    goal: p.goal as LearningGoal,
    format: p.format as LearningFormat,
    pace: p.pace as LearningPace,
    palette: p.palette as LearningPalette,
    textSize: p.textSize as LearningTextSize,
    reduceMotion: p.reduceMotion,
    confidence: p.confidence as 1 | 2 | 3
  };
}

export function learnerStorageKey(homeAccountId: string): string {
  // Identity-specific storage prevents a different signed-in account reading this
  // browser's previous learner's preferences. Do not store authentication tokens.
  return "academy:learner-preferences:v1:" + encodeURIComponent(homeAccountId);
}

export function readBrowserLearnerPreferences(homeAccountId: string): LearnerPreferences | null {
  try {
    const key = learnerStorageKey(homeAccountId);
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    return raw ? validateLearnerPreferences(JSON.parse(raw) as unknown) : null;
  } catch { return null; }
}

export function saveBrowserLearnerPreferences(homeAccountId: string, profile: LearnerPreferences, remember: boolean): void {
  const key = learnerStorageKey(homeAccountId);
  const data = JSON.stringify(profile);
  sessionStorage.setItem(key, data);
  if (remember) localStorage.setItem(key, data);
  else localStorage.removeItem(key);
}

export function deleteBrowserLearnerPreferences(homeAccountId: string): void {
  const key = learnerStorageKey(homeAccountId);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

export interface LearnerCourseSummary { title: string; description: string; level: string; }
const searchTerms: Record<LearningFocus, string[]> = {
  cloud: ["cloud", "azure", "aws", "infrastructure"],
  cybersecurity: ["security", "cyber", "soc", "network"],
  ai: ["ai", "artificial intelligence", "automation", "machine learning"],
  it: ["computer", "it", "support", "network", "fundamentals"],
  exploring: []
};

/** Reorder *real* supplied catalogue records; never invent a course or achievement. */
export function recommendCourses<T extends LearnerCourseSummary>(courses: readonly T[], profile: LearnerPreferences): T[] {
  const terms = searchTerms[profile.focus];
  return courses.map((course, index) => {
    const haystack = (course.title + " " + course.description + " " + course.level).toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { course, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.course);
}

export function preferredStart(profile: LearnerPreferences): string {
  const starts: Record<LearningFormat, string> = {
    practice: "Start with an available hands-on exercise or lab.",
    visual: "Start with a course overview or diagram when the course provides one.",
    reading: "Start with a short reading or reference when the course provides one.",
    guided: "Start with a guided explanation, then practise what you learned."
  };
  return starts[profile.format];
}
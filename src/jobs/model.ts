export const trackerStages = ["Saved", "Applied", "Screening", "Interview", "Offer", "Accepted", "Declined", "Withdrawn", "Closed"] as const;
export const reviewStages = ["Applied", "Screening", "Interview", "Offer", "Accepted", "Declined", "Closed"] as const;
export type Stage = typeof trackerStages[number];

export interface CareerProfile {
  name: string;
  email: string;
  location: string;
  target: string;
  version: string;
}
export interface Vacancy {
  id: string;
  title: string;
  company: string;
  location: string;
  summary: string;
  open: boolean;
  version: string;
}
export interface JobEntry {
  id: string;
  vacancyId: string | null;
  title: string;
  company: string;
  source: string;
  stage: Stage;
  nextAction: string;
  followUp: string;
  created: string;
  version: string;
}
export interface Submission extends JobEntry {
  applicant: string;
  email: string;
}
export interface JobsDashboard {
  profile: CareerProfile | null;
  vacancies: Vacancy[];
  entries: JobEntry[];
  recruiter: boolean;
}
export interface RecruitmentDashboard {
  vacancies: Vacancy[];
  submissions: Submission[];
}
export function activeStage(stage: Stage) {
  return !(["Accepted", "Declined", "Withdrawn", "Closed"] as Stage[]).includes(stage);
}
export function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export function metrics(entries: JobEntry[], now = new Date()) {
  const today = localDateKey(now);
  return {
    active: entries.filter(entry => activeStage(entry.stage)).length,
    interviews: entries.filter(entry => entry.stage === "Interview").length,
    offers: entries.filter(entry => entry.stage === "Offer").length,
    due: entries.filter(entry => activeStage(entry.stage) && entry.followUp && entry.followUp <= today).length
  };
}

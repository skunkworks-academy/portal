import { useEffect, useState } from "react";
import type { SkunkieLearnerProfile } from "./learner-assessment/model";
import type { JourneyWorkspaceConfiguration } from "./learner-assessment/journey";
import "./learner-onboarding.css";

export type WorkspaceCatalogueCourse = { courseId: string; title: string; category: string; level: string; estimatedEffort: string; courseUrl: string };
const levelPatterns = { foundation: /beginner|foundation|introduct|fundamental/i, standard: /intermediate/i, stretch: /advanced/i };
export function buildLearnerWorkspacePlan(profile: SkunkieLearnerProfile, courses: readonly WorkspaceCatalogueCourse[]) {
  const configuration = profile.assessment.journey?.workspaceConfiguration;
  if (!configuration) return null;
  const terms = [...new Set(profile.assessment.interests.flatMap(value => value.toLocaleLowerCase().split(/\s+/)).filter(value => value.length >= 2))];
  const matches = courses.flatMap(course => {
    let url: URL;
    try { url = new URL(course.courseUrl); } catch { return []; }
    if (url.protocol !== "https:" || url.username || url.password || url.port || !((url.hostname === "www.skunkworksacademy.com" && url.pathname.startsWith("/courses/")) || (url.hostname === "skunkworks-academy.github.io" && url.pathname.startsWith("/course-catalog/courses/")))) return [];
    const metadata = `${course.title} ${course.category}`.toLocaleLowerCase();
    const found = terms.filter(term => metadata.includes(term));
    const levelMatch = levelPatterns[configuration.difficulty].test(course.level);
    // With stated topics, do not fill empty results with unrelated courses.
    if (terms.length ? !found.length : !levelMatch) return [];
    return [{ course, score: found.length * 2 + Number(levelMatch), reason: `${found.length ? `Published title or subject matches your interest: ${found.join(", ")}.` : "Published level matches your chosen starting difficulty."} Course level: ${course.level}.` }];
  }).sort((a, b) => b.score - a.score || a.course.title.localeCompare(b.course.title)).slice(0, 3);
  const practiceMinutes = Math.round(configuration.sessionMinutes * configuration.practiceProportion / 100);
  return { configuration, matches, practiceMinutes, conceptMinutes: configuration.sessionMinutes - practiceMinutes,
    order: configuration.preferredOrder === "practice-first" ? ["practice", "concept"] as const : ["concept", "practice"] as const };
}

type Props = {
  profile: SkunkieLearnerProfile;
  loadCatalogue: (signal: AbortSignal) => Promise<{ courses: WorkspaceCatalogueCourse[] }>;
  onEdit: () => void; onOpenPractice: () => void; onOpenLearning: () => void; onBrowse: () => void;
};
export function LearnerWorkspacePlan({ profile, loadCatalogue, onEdit, onOpenPractice, onOpenLearning, onBrowse }: Props) {
  const [courses, setCourses] = useState<WorkspaceCatalogueCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setCourses([]); setError("");
    void loadCatalogue(abort.signal).then(value => { if (!abort.signal.aborted) setCourses(value.courses); })
      .catch(() => { if (!abort.signal.aborted) setError("Course suggestions could not be loaded. Your saved session plan is still available."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [profile.learnerSubject, loadCatalogue, refresh]);
  const plan = buildLearnerWorkspacePlan(profile, courses);
  if (!plan) return null;
  const { configuration } = plan;
  function help(kind: "concept" | "practice", setting: JourneyWorkspaceConfiguration["helpLevel"]) {
    const guidance = kind === "concept" ? "Read the published overview and prerequisites. In an enrolled lesson, choose one concept and explain it in your own words before moving on." : "Use an approved lesson or lab. Try one task, compare the actual result with the expected result, then record a question or retry with a hint. The Networking workspace can save its supported practice checks.";
    return setting === "guided" ? <p>{guidance}</p> : <details><summary>{setting === "hints" ? "Show a hint" : "Show help if I need it"}</summary><p>{guidance}</p></details>;
  }
  return <section className="learner-workspace-plan" aria-label="Your saved learning plan" data-activity-order={configuration.preferredOrder} data-help-level={configuration.helpLevel}>
    <header><p className="student-kicker">Saved learner setup</p><h2>Your {configuration.sessionMinutes}-minute starting session</h2><p>{configuration.difficulty} difficulty · {configuration.helpLevel} help · {configuration.practiceProportion}% practice</p><button type="button" onClick={onEdit}>Edit my learning setup</button></header>
    <ol className="learner-workspace-plan__steps">{plan.order.map(kind => <li key={kind}><article>
      <h3>{kind === "concept" ? `Explore a concept · ${plan.conceptMinutes} min` : `Try and check · ${plan.practiceMinutes} min`}</h3>
      {help(kind, configuration.helpLevel)}
      {kind === "concept" ? <button type="button" onClick={onOpenLearning}>Open my enrolled learning</button> : <button type="button" onClick={onOpenPractice}>Open supported practice</button>}
      {kind === "practice" && <p className="learner-onboarding__hint">Saved adaptive practice currently covers staff-mapped Networking courses. Your actual enrolments determine availability. The practice check records an outcome and recommends the next step; it does not award course completion.</p>}
    </article></li>)}</ol>
    <div><h3>Published courses to explore</h3>
      {loading && <p role="status">Checking the Academy catalogue against your saved interests and starting difficulty…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => setRefresh(value => value + 1)}>Retry suggestions</button></p>}
      {!loading && !error && (plan.matches.length ? <ul>{plan.matches.map(({ course, reason }) => <li key={course.courseId}><a href={course.courseUrl} target="_blank" rel="noopener noreferrer">{course.title} ↗</a><p>{reason}</p><small>{course.estimatedEffort}</small></li>)}</ul> : <p>No published course metadata matches these choices yet. Browse the actual catalogue or edit your interests.</p>)}
      <button type="button" onClick={onBrowse}>Browse all published courses</button><p className="learner-onboarding__hint">Suggestions are based on stated interests and published metadata. They do not enrol you, certify readiness or change a course’s difficulty. Check the overview for availability.</p>
    </div>
    <details><summary>Why this plan?</summary><ul>{profile.assessment.journey?.rationale.map(reason => <li key={reason}>{reason}</li>)}</ul><p>Time allocation, order and help come from your saved choices. Your Networking activities use their own saved diagnostic and practice evidence to suggest the next activity.</p></details>
  </section>;
}

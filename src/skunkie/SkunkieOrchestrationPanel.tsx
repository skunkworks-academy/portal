import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { SKUNKIE_AVATAR_SRC } from "../skunkie-assets";
import { portalApi } from "../api";
import { routeLearningGoal } from "./orchestrator";
import type { KnowledgeQuestion, LearningOutcome, LearningSession, SkunkieContext } from "./contracts";
import "./learning-workspace.css";

type Props = { onAssess: () => void; onCourses: () => void };
export function SkunkieOrchestrationPanel({ onAssess, onCourses }: Props) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [context, setContext] = useState<SkunkieContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [goal, setGoal] = useState("");
  const [courseId, setCourseId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [outcome, setOutcome] = useState<LearningOutcome | null>(null);
  const [check, setCheck] = useState<number | null>(null);
  const activityRef = useRef<HTMLElement>(null);
  const focusActivity = useRef(false);
  useEffect(() => {
    if (focusActivity.current && session) { activityRef.current?.focus(); focusActivity.current = false; }
  }, [session?.id]);
  useEffect(() => {
    let active = true;
    setContext(null); setSession(null); setOutcome(null); setLoading(true); setError("");
    if (!account) { setLoading(false); return; }
    void portalApi.skunkieContext({ instance, account }).then(data => {
      if (!active) return;
      setContext(data); setCourseId(data.courses[0]?.id ?? "");
      const latest = data.sessions[0] ?? null;
      setSession(latest); setOutcome(data.outcomes.find(o => o.sessionId === latest?.id) ?? null);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Your learning space could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account?.homeAccountId, instance, reload]);
  async function assess() {
    if (!account) return;
    setBusy(true); setError("");
    try {
      const result = await portalApi.skunkieAssessNetworking({ courseId, goal, answers, consentToStore: consent }, { instance, account });
      focusActivity.current = true;
      setSession(result); setOutcome(null); setCheck(null);
      setContext(previous => previous ? { ...previous, sessions: [result, ...previous.sessions] } : previous);
    } catch (e) { setError(e instanceof Error ? e.message : "Assessment could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  async function evaluate() {
    if (!account || !session || check === null) return;
    setBusy(true); setError("");
    try {
      const result = await portalApi.skunkieEvaluate(session.id, check, { instance, account });
      setOutcome(result);
      setContext(previous => previous ? { ...previous, outcomes: [...previous.outcomes.filter(o => o.sessionId !== result.sessionId), result] } : previous);
    } catch (e) { setError(e instanceof Error ? e.message : "Your result could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  const route = routeLearningGoal(goal);
  return <section className="student-view student-companion-view skunkie-learning" aria-label="Skunkie learning orchestrator">
    <div className="student-companion-header">
      <div className="student-skunkie-avatar" aria-hidden="true"><img src={SKUNKIE_AVATAR_SRC} alt="" width="64" height="64" /></div>
      <div><p className="student-kicker">Your Academy learning companion</p><h2>Start with Skunkie</h2>
        <p>Welcome{context?.learner.name ? `, ${context.learner.name}` : ""}. Tell me your goal, try a short knowledge check, and we'll work through your next learning activity.</p></div>
    </div>
    <ol className="skunkie-flow" aria-label="Learning flow"><li>Share a goal</li><li>Assess</li><li>Learn and practise</li><li>Check progress</li></ol>
    {loading && <p role="status">Loading your Academy enrolments and learning evidence…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={busy || loading} onClick={() => setReload(n => n + 1)}>Reload learning space</button></div>}
    {!account && <p>Sign in with Microsoft to load your learner profile and enrolled courses.</p>}
    {context && <>
      <p>{context.courses.length} enrolled course{context.courses.length === 1 ? "" : "s"} connected to Networking · {context.sessions.length} saved diagnostics · {context.outcomes.length} recorded practice checks</p>
      <div className="student-action-row"><button type="button" onClick={onAssess}>Learning preferences</button><button type="button" onClick={onCourses}>My LMS courses</button></div>
      {context.courses.length === 0 ? <div className="student-panel"><h3>Your Networking path needs a course connection</h3><p>Skunkie needs an active enrolment in a published Networking Basics course with staff-mapped lessons. Ask your Academy team to connect it, or view your LMS courses.</p></div> : <form onSubmit={e => { e.preventDefault(); void assess(); }}>
        <fieldset disabled={busy}><legend>Networking Basics diagnostic</legend>
          <label htmlFor="skunkie-course">Your enrolled course</label>
          <select id="skunkie-course" value={courseId} onChange={e => setCourseId(e.target.value)}>{context.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          <label htmlFor="skunkie-goal">What would you like to achieve?</label>
          <textarea id="skunkie-goal" required maxLength={1000} rows={3} value={goal} onChange={e => setGoal(e.target.value)} placeholder="For example: troubleshoot a basic network" />
          {route.companionId && route.companionId !== "networking" && <p>Your goal may suit {route.companionName}. That specialist is planned; this pilot covers Networking Basics.</p>}
          {context.questions.map(q => <Question key={q.id} question={q} value={answers[q.id]} onChange={value => setAnswers(a => ({ ...a, [q.id]: value }))} />)}
          <label className="skunkie-choice"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />Save my goal, assessment results, activity and practice outcome to my Academy account.</label>
          <p><small>Three questions provide limited practice evidence. They do not determine aptitude, disability, course completion or certification.</small></p>
          <button type="submit" disabled={!goal.trim() || !consent || context.questions.some(q => answers[q.id] === undefined)}>{busy ? "Saving…" : "Assess and build my activity"}</button>
        </fieldset>
      </form>}
      {session && <article ref={activityRef} tabIndex={-1} className="student-panel" aria-label="Personalised Networking activity" aria-live="polite">
        <p className="student-kicker">Saved diagnostic · {session.assessment.percent}% · {new Date(session.createdAt).toLocaleString()}</p>
        <h3>{session.activity.title}</h3>
        <p>Selected from your diagnostic evidence and saved learning preferences. Session budget: {session.activity.minutes} minutes. Approach: {session.context.approach.replaceAll("_", " ")}.</p>
        <p>{session.activity.explanation}</p><ol>{session.activity.steps.map(step => <li key={step}>{step}</li>)}</ol>
        <p>Continue with mapped Academy lesson <code>{session.activity.lessonId}</code> in My LMS courses.</p>
        {outcome ? <div role="status"><strong>{outcome.correct ? "Practice check demonstrated" : "More practice recommended"}</strong><p>{outcome.nextStep}</p><small>Outcome saved {new Date(outcome.at).toLocaleString()}. This does not mark the LMS lesson complete.</small></div> : <form onSubmit={e => { e.preventDefault(); void evaluate(); }}>
          <fieldset disabled={busy}><legend>Check what you learned</legend><Question question={session.activity.check} value={check ?? undefined} onChange={setCheck} /><button disabled={check === null} type="submit">{busy ? "Saving…" : "Check and save progress"}</button></fieldset>
        </form>}
      </article>}
    </>}
    <p><small>Networking practice uses structured Academy activities. Voice, image input, other specialist execution and approved GitHub workspace provisioning are planned.</small></p>
  </section>;
}
function Question({ question, value, onChange }: { question: KnowledgeQuestion; value: number | undefined; onChange: (value: number) => void }) {
  return <fieldset className="skunkie-question"><legend>{question.prompt}</legend>{question.options.map((option, index) => <label className="skunkie-choice" key={option}><input required type="radio" name={question.id} checked={value === index} onChange={() => onChange(index)} />{option}</label>)}</fieldset>;
}

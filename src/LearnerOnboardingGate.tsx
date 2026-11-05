import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { portalApi } from "./api";
import { learningErrorMessage } from "./learning-errors";
import type { SkunkieLearnerAssessment, SkunkieLearnerProfile } from "./learner-assessment/model";
import { createLearnerJourney, journeyQuestions, type JourneyInput, type JourneyWorkspaceConfiguration } from "./learner-assessment/journey";
import { SkunkieAvatar } from "./SkunkieAvatar";
import { useSkunkieVoice } from "./useSkunkieVoice";
import { readSkunkiePreferences, saveSkunkiePreferences } from "./skunkie-preferences";
import "./skunkie-companion.css";
import "./learner-onboarding.css";

type GateProps = { enabled: boolean; children: (profile: SkunkieLearnerProfile | null, edit: () => void) => ReactNode };
export function LearnerOnboardingGate({ enabled, children }: GateProps) {
  const { accounts } = useMsal();
  const account = accounts[0];
  if (!enabled || !account) return <>{children(null, () => undefined)}</>;
  return <AccountOnboarding key={account.homeAccountId} account={account}>{children}</AccountOnboarding>;
}

type Draft = { step: number; assessment: SkunkieLearnerAssessment; journey: JourneyInput; consent: boolean };
const approachOptions = [{ id: "hands_on", label: "Hands-on practice" }, { id: "examples", label: "Worked examples" }, { id: "reading", label: "Reading and notes" }, { id: "discussion", label: "Guided discussion" }, { id: "video", label: "Video demonstrations" }] as const;
export const onboardingDraftKey = (accountId: string) => `academy:learner-setup-draft:v1:${encodeURIComponent(accountId)}`;
export function hasSavedLearnerJourney(profile: SkunkieLearnerProfile | null): boolean {
  try {
    if (!profile?.assessment?.consentToStore || !profile.assessment.journey) return false;
    return createLearnerJourney(profile.assessment.journey).checkAnswers.length === journeyQuestions.length;
  } catch { return false; }
}
export function learnerSubjectForAccount(account: AccountInfo): string {
  const objectId = account.idTokenClaims?.oid;
  return typeof objectId === "string" && objectId ? objectId : account.localAccountId || "";
}
function profileMatchesAccount(profile: SkunkieLearnerProfile, account: AccountInfo) {
  const expected = learnerSubjectForAccount(account);
  const a = profile?.assessment;
  const strings = (value: unknown, limit: number, length: number): value is string[] => Array.isArray(value) && value.length <= limit && value.every(item => typeof item === "string" && item.length <= length);
  return Boolean(expected && profile?.schemaVersion === 1 && a?.schemaVersion === 1 && profile.learnerSubject === expected &&
    typeof a.assessmentId === "string" && ["explore", "career", "certification", "skills"].includes(a.studyGoal) &&
    [15,30,60].includes(a.preferredSessionMinutes) && [1,2,3,4,5].includes(a.selfRatedConfidence) &&
    strings(a.preferredApproaches, 5, 20) && a.preferredApproaches.length > 0 && a.preferredApproaches.every(value => approachOptions.some(option => option.id === value)) &&
    strings(a.interests, 12, 80) && strings(a.supportNeeds, 8, 120) && (a.notes === undefined || typeof a.notes === "string"));
}
function submittedValues(assessment: SkunkieLearnerAssessment) {
  const journey = createLearnerJourney(assessment.journey);
  const list = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))].sort();
  return { assessmentId: assessment.assessmentId, studyGoal: assessment.studyGoal, consentToStore: assessment.consentToStore,
    preferredApproaches: list(assessment.preferredApproaches), preferredSessionMinutes: assessment.preferredSessionMinutes,
    selfRatedConfidence: assessment.selfRatedConfidence, interests: list(assessment.interests), supportNeeds: list(assessment.supportNeeds),
    notes: assessment.notes || "", language: assessment.language || "", workspaceConfiguration: journey.workspaceConfiguration,
    checkAnswers: [...journey.checkAnswers].sort((a, b) => a.questionId.localeCompare(b.questionId)) };
}
export function confirmsLearnerSubmission(saved: SkunkieLearnerProfile, submitted: SkunkieLearnerAssessment, account: AccountInfo) {
  try { return profileMatchesAccount(saved, account) && hasSavedLearnerJourney(saved) && JSON.stringify(submittedValues(saved.assessment)) === JSON.stringify(submittedValues(submitted)); }
  catch { return false; }
}
function initialDraft(profile: SkunkieLearnerProfile | null): Draft {
  const assessment: SkunkieLearnerAssessment = profile?.assessment ?? {
    schemaVersion: 1, assessmentId: crypto.randomUUID(), updatedAt: new Date().toISOString(), consentToStore: false,
    studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30, selfRatedConfidence: 3, interests: [], supportNeeds: []
  };
  return { step: 0, assessment, journey: assessment.journey ?? { version: 1, workspaceConfiguration: {
    sessionMinutes: assessment.preferredSessionMinutes, difficulty: "foundation", helpLevel: "guided", preferredOrder: "concept-first", practiceProportion: 50
  }, checkAnswers: [] }, consent: false };
}
function readDraft(accountId: string, profile: SkunkieLearnerProfile | null): Draft {
  const fallback = initialDraft(profile);
  try {
    const raw = JSON.parse(sessionStorage.getItem(onboardingDraftKey(accountId)) || "null") as Draft | null;
    if (!raw || !Number.isInteger(raw.step) || raw.step < 0 || raw.step > 3) return fallback;
    const a = raw.assessment;
    if (!a || a.schemaVersion !== 1 || !["explore", "career", "certification", "skills"].includes(a.studyGoal) || ![1,2,3,4,5].includes(a.selfRatedConfidence) ||
      !Array.isArray(a.interests) || a.interests.length > 12 || !a.interests.every(v => typeof v === "string" && v.length <= 80) ||
      !Array.isArray(a.supportNeeds) || a.supportNeeds.length > 8 || !a.supportNeeds.every(v => typeof v === "string" && v.length <= 120) ||
      !Array.isArray(a.preferredApproaches) || !a.preferredApproaches.length || !a.preferredApproaches.every(v => ["hands_on", "examples", "reading", "discussion", "video"].includes(v)) ||
      (a.notes !== undefined && (typeof a.notes !== "string" || a.notes.length > 1000))) return fallback;
    const journey = createLearnerJourney(raw.journey);
    // Keep server identity/other questionnaire fields authoritative while restoring only editable draft fields.
    return { step: raw.step, assessment: { ...fallback.assessment, studyGoal: a.studyGoal, preferredApproaches: a.preferredApproaches,
      selfRatedConfidence: a.selfRatedConfidence, interests: a.interests, supportNeeds: a.supportNeeds, notes: a.notes }, journey, consent: false };
  } catch { return fallback; }
}

function AccountOnboarding({ account, children }: { account: AccountInfo; children: GateProps["children"] }) {
  const { instance } = useMsal();
  const [profile, setProfile] = useState<SkunkieLearnerProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(null));
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [ui, setUi] = useState(() => readSkunkiePreferences(account.homeAccountId));
  const generation = useRef(0);
  const saveRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(draft.step);
  const ready = hasSavedLearnerJourney(profile) && !editing;
  const voice = useSkunkieVoice(account.homeAccountId, !ready, text => setDraft(value => ({ ...value, assessment: { ...value.assessment, notes: `${value.assessment.notes || ""} ${text}`.trim().slice(0, 1000) } })));
  const prompts = ["Let’s build a learning space that works for your goal. What would you like to learn?", "Try two short practice examples. Choose I’m not sure whenever you need an explanation.", "Choose how to start. You can change every setting later, and your practice outcomes can guide the next activity.", "Review your choices and decide whether to save them to your Academy account."];
  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 30000);
    setLoading(true); setLoaded(false); setError("");
    void portalApi.mySkunkieAssessment({ instance, account }, abort.signal).then(saved => {
      if (current !== generation.current) return;
      if (saved && !profileMatchesAccount(saved, account)) throw new Error("The learner profile could not be matched to this Microsoft account.");
      setProfile(saved); setDraft(readDraft(account.homeAccountId, saved)); setLoaded(true);
    }).catch(e => { if (current === generation.current) { setDraft(readDraft(account.homeAccountId, null)); setError(`${learningErrorMessage(e, "assessment")} Your saved profile could not be checked. Retry before saving a new setup.`); } })
      .finally(() => { window.clearTimeout(timeout); if (current === generation.current) setLoading(false); });
    return () => { generation.current++; window.clearTimeout(timeout); abort.abort(); saveRequest.current?.abort(); };
  }, [account.homeAccountId, instance, retry]);
  useEffect(() => {
    document.body.toggleAttribute("data-portal-onboarding", !ready);
    window.dispatchEvent(new CustomEvent("skunkworksacademy:onboarding-state", { detail: { active: !ready } }));
    return () => { document.body.removeAttribute("data-portal-onboarding"); window.dispatchEvent(new CustomEvent("skunkworksacademy:onboarding-state", { detail: { active: false } })); };
  }, [ready]);
  useEffect(() => {
    if (!loaded || ready) return;
    try { sessionStorage.setItem(onboardingDraftKey(account.homeAccountId), JSON.stringify({ ...draft, consent: false })); }
    catch { setDraftNotice("This browser cannot keep an unfinished draft after you leave. Keep this page open until saving succeeds."); }
  }, [draft, loaded, ready, account.homeAccountId]);
  useEffect(() => {
    if (!ready && !loading) {
      heading.current?.focus({ preventScroll: true });
      if (previousStep.current !== draft.step) heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
      previousStep.current = draft.step;
    }
  }, [draft.step, ready, loading]);
  function patchAssessment(change: Partial<SkunkieLearnerAssessment>) { setDraft(value => ({ ...value, assessment: { ...value.assessment, ...change } })); }
  function patchConfiguration(change: Partial<JourneyWorkspaceConfiguration>) { setDraft(value => ({ ...value, journey: { ...value.journey, workspaceConfiguration: { ...value.journey.workspaceConfiguration, ...change } } })); }
  function edit() { setDraft(readDraft(account.homeAccountId, profile)); setEditing(true); setError(""); }
  function showAvatar() {
    const next = { ...ui, showAvatar: !ui.showAvatar }; setUi(next);
    if (!saveSkunkiePreferences(account.homeAccountId, next)) setDraftNotice("Avatar choice applies to this session; browser storage is unavailable.");
  }
  async function save() {
    if (!loaded || busy || !draft.consent || !draft.assessment.preferredApproaches.length || draft.journey.checkAnswers.length !== journeyQuestions.length) return;
    const current = generation.current;
    const abort = new AbortController(); saveRequest.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 30000);
    setBusy(true); setError(""); voice.stopAudio();
    try {
      const journey = createLearnerJourney(draft.journey);
      const submitted = { ...draft.assessment, consentToStore: true, interests: draft.assessment.interests.map(s => s.trim()).filter(Boolean),
        supportNeeds: draft.assessment.supportNeeds.map(s => s.trim()).filter(Boolean), preferredSessionMinutes: journey.workspaceConfiguration.sessionMinutes, journey };
      const saved = await portalApi.saveSkunkieAssessment(submitted, { instance, account }, abort.signal);
      if (current !== generation.current) return;
      if (!confirmsLearnerSubmission(saved, submitted, account)) throw new Error("The service has not confirmed this account’s submitted learning setup. Keep these answers and retry.");
      setProfile(saved); setEditing(false);
      try { sessionStorage.removeItem(onboardingDraftKey(account.homeAccountId)); } catch { /* A confirmed server save remains authoritative. */ }
    } catch (e) {
      if (current === generation.current) setError(`${learningErrorMessage(e, "assessment")} Your answers are still here. The learner workspace will open after a confirmed save.`);
    } finally { window.clearTimeout(timeout); if (current === generation.current) { setBusy(false); saveRequest.current = null; } }
  }
  async function removeSavedSetup() {
    if (!loaded || busy || !profile || !window.confirm("Delete your saved learner setup and its answers? Your separate career roadmap and course results will remain.")) return;
    const current = generation.current;
    const abort = new AbortController(); saveRequest.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 30000);
    setBusy(true); setDeleting(true); setError(""); voice.stopAudio();
    try {
      await portalApi.deleteSkunkieAssessment({ instance, account }, abort.signal);
      if (current !== generation.current) return;
      setProfile(null); setDraft(initialDraft(null)); setEditing(false);
      setDraftNotice("Your saved learner setup was deleted. You can create a new plan when ready.");
      try { sessionStorage.removeItem(onboardingDraftKey(account.homeAccountId)); }
      catch { setDraftNotice("Your saved account setup was deleted. This browser could not clear its draft; close this tab to discard it."); }
    } catch (e) {
      if (current === generation.current) setError(`${learningErrorMessage(e, "assessment")} Deletion could not be confirmed. Your current answers are still here; retry when the service is available.`);
    } finally { window.clearTimeout(timeout); if (current === generation.current) { setBusy(false); setDeleting(false); saveRequest.current = null; } }
  }
  if (ready) return <>{children(profile, edit)}</>;
  const config = draft.journey.workspaceConfiguration;
  return <main className="learner-onboarding" aria-labelledby="learner-setup-title">
    <div className="learner-onboarding__essential"><a href="?account=profile">My account</a><a href="https://skunkworksacademy.com/contact.html">Help</a><button type="button" onClick={showAvatar}>{ui.showAvatar ? "Use text only" : "Show Skunkie"}</button></div>
    {ui.showAvatar && <div className="learner-onboarding__avatar"><SkunkieAvatar active={!loading} activity={voice.listening ? "listening" : voice.speaking ? "speaking" : busy || loading ? "thinking" : draft.step === 0 ? "wave" : "idle"} /></div>}
    <section className="learner-onboarding__conversation">
      <p className="learner-onboarding__eyebrow">Skunkie · Your learning companion</p>
      <h1 id="learner-setup-title" ref={heading} tabIndex={-1}>{loading ? "Checking your saved learning setup…" : ["What would you like to work toward?", "Let’s try two short examples", "Make this learning space yours", "Review and save your starting plan"][draft.step]}</h1>
      {!loading && <><p>{prompts[draft.step]}</p><p className="learner-onboarding__progress">Step {draft.step + 1} of 4</p></>}
      {error && <div role="alert"><p>{error}</p>{!loaded && <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)}>Retry account check</button>}</div>}
      {draftNotice && <p role="status">{draftNotice}</p>}
      {!loading && <form onSubmit={event => { event.preventDefault(); if (draft.step === 3) void save(); else { voice.stopAudio(); setDraft(value => ({ ...value, step: value.step + 1 })); } }}>
        <fieldset disabled={busy || !loaded}>
          {draft.step === 0 && <>
            <label>Your goal<select value={draft.assessment.studyGoal} onChange={event => patchAssessment({ studyGoal: event.target.value as SkunkieLearnerAssessment["studyGoal"] })}><option value="skills">Develop practical skills</option><option value="career">Explore a career direction</option><option value="certification">Prepare for a certification</option><option value="explore">Find a starting point</option></select></label>
            <label>Tell Skunkie what you want to work on<textarea rows={2} maxLength={1000} value={draft.assessment.notes || ""} onChange={event => patchAssessment({ notes: event.target.value })} placeholder="A task, subject or question you want help with" /></label>
            <label>Topics you’re interested in <small>(separate with commas)</small><input value={draft.assessment.interests.join(",")} maxLength={240} onChange={event => patchAssessment({ interests: event.target.value.split(",").slice(0, 12).map(s => s.slice(0, 80)) })} /></label>
            <label>How confident do you feel about getting started?<select value={draft.assessment.selfRatedConfidence} onChange={event => patchAssessment({ selfRatedConfidence: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 })}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {n === 1 ? "New to this" : n === 5 ? "Very confident" : "Some confidence"}</option>)}</select></label>
            <p className="learner-onboarding__hint">This is your own confidence rating. It does not measure ability or assign a learning style.</p>
            {voice.canListen && <button type="button" onClick={voice.listening ? voice.stopListening : voice.startListening}>{voice.listening ? "Stop microphone" : "Speak my goal"}</button>}
          </>}
          {draft.step === 1 && <>{journeyQuestions.map(question => {
            const answer = draft.journey.checkAnswers.find(a => a.questionId === question.id);
            return <fieldset key={question.id} className="learner-onboarding__question"><legend>{question.prompt}</legend>{question.options.map(option => <label className="learner-onboarding__choice" key={option.id}><input type="radio" required name={question.id} checked={answer?.answerId === option.id} onChange={() => setDraft(value => ({ ...value, journey: { ...value.journey, checkAnswers: [...value.journey.checkAnswers.filter(a => a.questionId !== question.id), { questionId: question.id, questionVersion: 1, answerId: option.id }] } }))} />{option.label}</label>)}{answer && <p role="status">{question.explanation}</p>}</fieldset>;
          })}<p className="learner-onboarding__hint">These practice examples provide limited feedback. They are not an aptitude test, qualification or course completion.</p></>}
          {draft.step === 2 && <>
            <fieldset className="learner-onboarding__question"><legend>Which approaches would you like to use?</legend>{approachOptions.map(option => <label key={option.id} className="learner-onboarding__choice"><input type="checkbox" checked={draft.assessment.preferredApproaches.includes(option.id)} onChange={event => patchAssessment({ preferredApproaches: event.target.checked ? [...draft.assessment.preferredApproaches, option.id] : draft.assessment.preferredApproaches.filter(value => value !== option.id) })} />{option.label}</label>)}<p>Choose at least one. These are flexible preferences, not a fixed learning style.</p></fieldset>
            <label>Support and accessibility preferences <small>(optional; separate with commas)</small><textarea rows={2} maxLength={960} value={draft.assessment.supportNeeds.join(",")} onChange={event => patchAssessment({ supportNeeds: event.target.value.split(",").slice(0, 8).map(value => value.slice(0, 120)) })} placeholder="For example: captions, keyboard navigation, screen-reader-friendly text" /></label>
            <p className="learner-onboarding__hint">Describe useful support without medical or diagnostic details. These requests are saved for planning; availability depends on the course materials.</p>
            <label>Session length<select value={config.sessionMinutes} onChange={event => patchConfiguration({ sessionMinutes: Number(event.target.value) as 15 | 30 | 60 })}>{[15,30,60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
            <label>Starting difficulty<select value={config.difficulty} onChange={event => patchConfiguration({ difficulty: event.target.value as JourneyWorkspaceConfiguration["difficulty"] })}><option value="foundation">Foundation — build the basics</option><option value="standard">Standard — apply what I know</option><option value="stretch">Stretch — try a challenge</option></select></label>
            <label>Help to show first<select value={config.helpLevel} onChange={event => patchConfiguration({ helpLevel: event.target.value as JourneyWorkspaceConfiguration["helpLevel"] })}><option value="guided">Guided steps</option><option value="hints">Hints when needed</option><option value="independent">Try independently</option></select></label>
            <label>Activity order<select value={config.preferredOrder} onChange={event => patchConfiguration({ preferredOrder: event.target.value as JourneyWorkspaceConfiguration["preferredOrder"] })}><option value="concept-first">Concept and example, then practice</option><option value="practice-first">Try practice, then review the concept</option></select></label>
            <label>Time for practice<select value={config.practiceProportion} onChange={event => patchConfiguration({ practiceProportion: Number(event.target.value) as 25 | 50 | 75 })}>{[25,50,75].map(n => <option key={n} value={n}>{n}% of my session</option>)}</select></label>
            <p className="learner-onboarding__hint">These settings arrange your starting plan. Available courses keep their actual level and content; nothing is marked complete for you.</p>
          </>}
          {draft.step === 3 && <>
            <ul>{createLearnerJourney(draft.journey).rationale.map(reason => <li key={reason}>{reason}</li>)}</ul>
            <p>We will store your goal, topic interests, stated preferences, answers to these examples and starting configuration in your Academy learner profile. Your separate career roadmap and course results are unchanged.</p>
            <label className="learner-onboarding__choice"><input type="checkbox" checked={draft.consent} onChange={event => setDraft(value => ({ ...value, consent: event.target.checked }))} required />I agree to save this learner profile to my Academy account.</label>
            <a href="https://skunkworksacademy.com/privacy.html">How Academy handles personal information</a>
          </>}
          <div className="learner-onboarding__actions">{draft.step > 0 && <button type="button" onClick={() => { voice.stopAudio(); setDraft(value => ({ ...value, step: value.step - 1 })); }}>Back</button>}<button type="submit" disabled={busy || (draft.step === 1 && draft.journey.checkAnswers.length !== journeyQuestions.length) || (draft.step === 2 && !draft.assessment.preferredApproaches.length) || (draft.step === 3 && (!loaded || !draft.consent))}>{busy ? "Saving to your account…" : draft.step === 3 ? "Save and open my learning space" : "Continue"}</button>{editing && <button type="button" onClick={() => { voice.stopAudio(); setEditing(false); }}>Keep my saved plan</button>}</div>
        </fieldset>
      </form>}
      {!loading && editing && profile && <button type="button" disabled={busy} onClick={() => void removeSavedSetup()}>{deleting ? "Deleting your saved setup…" : "Delete saved learner setup"}</button>}
      {!loading && voice.canSpeak && <button className="learner-onboarding__read" type="button" onClick={() => voice.speaking ? voice.stopAudio() : voice.speak(prompts[draft.step])}>{voice.speaking ? "Stop reading" : "Read this introduction aloud"}</button>}
      {voice.notice && <p role="status">{voice.notice}</p>}
      <p className="learner-onboarding__hint">Text is always available. Voice starts only when selected and may use your browser’s online speech service. Unfinished answers stay in this tab’s account-specific draft until saved or the tab closes. No chat transcript is stored by this setup.</p>
    </section>
  </main>;
}

import { useState, type FormEvent } from "react";
import { SKUNKIE_AVATAR_SRC } from "./skunkie-assets";
import {
  defaultLearnerPreferences,
  focusLabels,
  formatLabels,
  preferredStart,
  recommendCourses,
  type LearnerCourseSummary,
  type LearnerPreferences,
  type LearningFocus,
  type LearningFormat
} from "./learner-adaptation";
import "./learner-discovery.css";

type ChoiceProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};
function Choice({ label, hint, children }: ChoiceProps) {
  return <label className="learner-choice"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function LearnerDiscovery({
  name,
  initial,
  busy,
  editing,
  rememberByDefault,
  onSave,
  onSkip
}: {
  name: string;
  initial: LearnerPreferences | null;
  busy: boolean;
  editing: boolean;
  rememberByDefault: boolean;
  onSave: (profile: LearnerPreferences, remember: boolean) => Promise<void>;
  onSkip: () => void;
}) {
  const [draft, setDraft] = useState<LearnerPreferences>(initial ?? defaultLearnerPreferences);
  const [remember, setRemember] = useState(rememberByDefault);
  function set<K extends keyof LearnerPreferences>(field: K, value: LearnerPreferences[K]) {
    setDraft(current => ({ ...current, [field]: value }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(draft, remember);
  }

  return <section className="learner-discovery" aria-labelledby="learner-discovery-heading">
    <header className="learner-discovery-hero">
      <img src={SKUNKIE_AVATAR_SRC} width="80" height="80" alt="Skunkie, your Academy AI learning companion" />
      <div>
        <p className="student-kicker">Meet your AI learning companion</p>
        <h2 id="learner-discovery-heading">{editing ? "Shape your learning space" : "Hi " + name.split(" ")[0] + ", I'm Skunkie!"}</h2>
        <p>Before I help you learn, I'd like to learn about you. Your answers help arrange your Academy dashboard around your goals and preferences.</p>
      </div>
    </header>
    <p className="learner-discovery-note">This is a starting preference assessment, not a permanent “learning style” label or a measured skill level. You can change your choices whenever you like.</p>
    <form onSubmit={submit}>
      <fieldset className="learner-fieldset">
        <legend>1. What would you like to achieve?</legend>
        <div className="learner-form-grid">
          <Choice label="My area of interest">
            <select value={draft.focus} onChange={e => set("focus", e.target.value as LearningFocus)}>
              {Object.entries(focusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </Choice>
          <Choice label="My immediate goal">
            <select value={draft.goal} onChange={e => set("goal", e.target.value as LearnerPreferences["goal"])}>
              <option value="skills">Improve practical skills</option>
              <option value="certification">Prepare for a certification</option>
              <option value="career">Move forward in my career</option>
              <option value="exploration">Explore something new</option>
            </select>
          </Choice>
          <Choice label="How confident do you feel about this subject?" hint="Self-reported only. Your actual competency will be measured through course assessments.">
            <select value={draft.confidence} onChange={e => set("confidence", Number(e.target.value) as LearnerPreferences["confidence"])}>
              <option value={1}>I'm new to it</option>
              <option value={2}>I know the basics</option>
              <option value={3}>I have some experience</option>
            </select>
          </Choice>
        </div>
      </fieldset>
      <fieldset className="learner-fieldset">
        <legend>2. How would you like to get started?</legend>
        <div className="learner-form-grid">
          <Choice label="What should Skunkie show you first?" hint="You can explore all formats at any time.">
            <select value={draft.format} onChange={e => set("format", e.target.value as LearningFormat)}>
              {Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Choice>
          <Choice label="Time for a typical study session">
            <select value={draft.pace} onChange={e => set("pace", e.target.value as LearnerPreferences["pace"])}>
              <option value="15">15 minutes — short sessions</option>
              <option value="30">30 minutes — steady sessions</option>
              <option value="60">60 minutes — deep focus</option>
            </select>
          </Choice>
        </div>
      </fieldset>
      <fieldset className="learner-fieldset">
        <legend>3. Make it comfortable to use</legend>
        <div className="learner-form-grid">
          <Choice label="Dashboard appearance">
            <select value={draft.palette} onChange={e => set("palette", e.target.value as LearnerPreferences["palette"])}>
              <option value="navy">Academy navy</option>
              <option value="teal">Ocean teal</option>
              <option value="amber">Warm amber</option>
              <option value="contrast">High contrast</option>
            </select>
          </Choice>
          <Choice label="Reading size">
            <select value={draft.textSize} onChange={e => set("textSize", e.target.value as LearnerPreferences["textSize"])}>
              <option value="standard">Standard text</option>
              <option value="large">Larger text</option>
            </select>
          </Choice>
          <label className="learner-check">
            <input type="checkbox" checked={draft.reduceMotion} onChange={e => set("reduceMotion", e.target.checked)} />
            <span>Reduce animation and movement</span>
          </label>
        </div>
      </fieldset>
      <label className="learner-consent">
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
        <span>Save these preferences to my Academy account when secure storage is available, and on this browser. If unchecked, use them only for this session. No chat transcript is saved.</span>
      </label>
      <div className="learner-discovery-actions">
        <button type="submit" className="primary-action" disabled={busy}>{busy ? "Personalising…" : "Build my learning space"}</button>
        <button type="button" className="learner-quiet-action" onClick={onSkip} disabled={busy}>{editing ? "Cancel" : "Skip for now"}</button>
      </div>
    </form>
  </section>;
}

export function PersonalisedLearningOverview({
  preferences,
  courses,
  syncNotice,
  onEdit,
  onReset,
  onNavigate
}: {
  preferences: LearnerPreferences;
  courses: readonly LearnerCourseSummary[];
  syncNotice: string;
  onEdit: () => void;
  onReset: () => void;
  onNavigate: (view: "lms" | "learning" | "companion" | "classes") => void;
}) {
  const recommended = recommendCourses(courses, preferences)[0];
  const objective: Record<LearnerPreferences["goal"], string> = {
    certification: "Certification readiness",
    career: "Career development",
    skills: "Practical skills",
    exploration: "Discovery and exploration"
  };
  return <section className="learner-overview" aria-label="Your personalised learning space">
    <div className="learner-overview-heading">
      <div>
        <p className="student-kicker">Designed around your choices</p>
        <h2>Your learning space</h2>
        <p>{focusLabels[preferences.focus]} · {objective[preferences.goal]} · {preferences.pace}-minute sessions</p>
        <small>{syncNotice}</small>
      </div>
      <div className="learner-overview-actions">
        <button type="button" onClick={onEdit}>Change my preferences</button>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </div>
    <div className="learner-overview-grid" data-first={preferences.format}>
      <article className="learner-overview-card learner-next-step">
        <p className="student-kicker">Suggested starting point</p>
        <h3>{recommended?.title ?? "Find your first Academy course"}</h3>
        <p>{recommended ? recommended.description : "No live catalogue recommendation is available yet. You can explore the current learning options."}</p>
        <small>Suggested from your stated interests, not from a verified diagnostic score.</small>
        <button type="button" onClick={() => onNavigate("learning")}>Explore courses</button>
      </article>
      <article className="learner-overview-card learner-format-first">
        <p className="student-kicker">Your preferred introduction</p>
        <h3>{formatLabels[preferences.format]}</h3>
        <p>{preferredStart(preferences)}</p>
        <button type="button" onClick={() => onNavigate("lms")}>Open Academy LMS</button>
      </article>
      <article className="learner-overview-card learner-companion-first">
        <p className="student-kicker">Learn with Skunkie</p>
        <h3>Ask for guidance, hints or an explanation</h3>
        <p>Skunkie can provide personalised AI responses once the Academy AI service is configured and available.</p>
        <button type="button" onClick={() => onNavigate("companion")}>Open learning companion</button>
      </article>
    </div>
  </section>;
}
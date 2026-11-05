import { useEffect, useState, type FormEvent } from "react";
import { useMsal } from "@azure/msal-react";
import { portalApi } from "../api";
import { learningErrorMessage } from "../learning-errors";
import type { SkunkieLearnerAssessment, SkunkieLearnerProfile } from "./model";
import type { IdRRoadmap } from "../idr/model";

const approaches = [
  { id: "hands_on", label: "Hands-on practice" },
  { id: "examples", label: "Worked examples" },
  { id: "reading", label: "Reading and written notes" },
  { id: "discussion", label: "Guided discussion" },
  { id: "video", label: "Video demonstrations" }
] as const;

export function LearnerAssessmentWorkspace() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const auth = account ? { instance, account } : undefined;
  const [saved, setSaved] = useState<SkunkieLearnerProfile | null>(null);
  const [form, setForm] = useState({
    studyGoal: "skills" as SkunkieLearnerAssessment["studyGoal"],
    preferredApproaches: ["hands_on"] as SkunkieLearnerAssessment["preferredApproaches"],
    preferredSessionMinutes: 30 as 15 | 30 | 60,
    selfRatedConfidence: 3 as 1 | 2 | 3 | 4 | 5,
    interests: "", supportNeeds: "", notes: "", consentToStore: false
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    setLoading(true);
    setMessage("");
    setForm({ studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30, selfRatedConfidence: 3, interests: "", supportNeeds: "", notes: "", consentToStore: false });
    if (!auth) { setLoading(false); return; }
    void portalApi.mySkunkieAssessment(auth).then(result => {
      if (cancelled || !result) return;
      setSaved(result);
      const a = result.assessment;
      setForm({
        studyGoal: a.studyGoal, preferredApproaches: a.preferredApproaches,
        preferredSessionMinutes: a.preferredSessionMinutes,
        selfRatedConfidence: a.selfRatedConfidence,
        interests: a.interests.join(", "), supportNeeds: a.supportNeeds.join(", "),
        notes: a.notes ?? "", consentToStore: true
      });
    }).catch(error => { if (!cancelled) setMessage(`${learningErrorMessage(error, "assessment")} Your answers have not been loaded.`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account?.homeAccountId, instance]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !form.consentToStore) return;
    setBusy(true);
    setMessage("");
    const assessment: SkunkieLearnerAssessment = {
      schemaVersion: 1,
      assessmentId: saved?.assessment.assessmentId ?? crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      consentToStore: true,
      studyGoal: form.studyGoal,
      preferredApproaches: form.preferredApproaches,
      preferredSessionMinutes: form.preferredSessionMinutes,
      selfRatedConfidence: form.selfRatedConfidence,
      interests: form.interests.split(",").map(s => s.trim()).filter(Boolean),
      supportNeeds: form.supportNeeds.split(",").map(s => s.trim()).filter(Boolean),
      notes: form.notes
    };
    try {
      setSaved(await portalApi.saveSkunkieAssessment(assessment, auth));
      setMessage("Your learner assessment is saved to your Academy account. It is separate from your career IDR.");
    } catch (error) {
      setMessage(`${learningErrorMessage(error, "assessment")} Your answers are still available here to retry.`);
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!auth || !window.confirm("Delete your saved Skunkie learner assessment? This will not delete your separate IDR.")) return;
    setBusy(true);
    try {
      await portalApi.deleteSkunkieAssessment(auth);
      setSaved(null);
      setForm({ studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30, selfRatedConfidence: 3, interests: "", supportNeeds: "", notes: "", consentToStore: false });
      setMessage("Assessment deleted.");
    } catch (error) { setMessage(`${learningErrorMessage(error, "assessment")} Deletion could not be confirmed.`); }
    finally { setBusy(false); }
  }

  return <section className="student-view" aria-label="Skunkie learner assessment">
    <div className="student-section-heading"><div><p className="student-kicker">Skunkie AI learning companion</p>
      <h2>Discover how you learn</h2>
      <p>This is about your learning experience, not your career roadmap. There are no right or wrong answers. Your preferences can change as you learn.</p>
    </div></div>
    {loading ? <p role="status">Loading your assessment…</p> : <form className="form-panel" onSubmit={event => void submit(event)}>
      <label className="full">What are you focusing on?
        <select value={form.studyGoal} onChange={e => setForm(v => ({ ...v, studyGoal: e.target.value as typeof v.studyGoal }))}>
          <option value="skills">Develop practical skills</option><option value="certification">Prepare for a certification</option>
          <option value="career">Explore career opportunities</option><option value="explore">Discover something new</option>
        </select>
      </label>
      <fieldset className="full"><legend>Which learning approaches would you like to try? Select any.</legend>
        {approaches.map(a => <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={form.preferredApproaches.includes(a.id)} onChange={e => setForm(v => ({
            ...v, preferredApproaches: e.target.checked ? [...v.preferredApproaches, a.id] : v.preferredApproaches.filter(x => x !== a.id)
          }))}/>{a.label}
        </label>)}
      </fieldset>
      <label>Preferred session duration
        <select value={form.preferredSessionMinutes} onChange={e => setForm(v => ({ ...v, preferredSessionMinutes: Number(e.target.value) as 15 | 30 | 60 }))}>
          <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
        </select>
      </label>
      <label>How confident do you currently feel about learning new material? (1–5)
        <select value={form.selfRatedConfidence} onChange={e => setForm(v => ({ ...v, selfRatedConfidence: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 }))}>
          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="full">Topics you are interested in (comma-separated)
        <input maxLength={500} value={form.interests} onChange={e => setForm(v => ({ ...v, interests: e.target.value }))} placeholder="Cloud, security, AI…"/>
      </label>
      <label className="full">What support or adjustments would help? (optional, comma-separated)
        <input maxLength={500} value={form.supportNeeds} onChange={e => setForm(v => ({ ...v, supportNeeds: e.target.value }))} placeholder="More practice, captions, extra time…"/>
      </label>
      <label className="full">Anything else Skunkie should know? (optional)
        <textarea maxLength={1000} value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}/>
      </label>
      <label className="full" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" required checked={form.consentToStore} onChange={e => setForm(v => ({ ...v, consentToStore: e.target.checked }))}/>
        Save these answers privately to my Academy learner profile.
      </label>
      <button type="submit" disabled={!auth || busy || !form.consentToStore || form.preferredApproaches.length === 0}>{busy ? "Saving…" : "Save learner assessment"}</button>
      {saved && <button type="button" disabled={busy} onClick={() => void remove()}>Delete saved assessment</button>}
    </form>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    <p className="student-muted">Learning preferences and self-rated confidence are not an aptitude diagnosis or proof of competency. Demonstrated abilities require separate valid assessments.</p>
  </section>;
}

export function IndividualRoadmapWorkspace() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [roadmap, setRoadmap] = useState<IdRRoadmap | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setRoadmap(null); setError(""); setLoading(true);
    if (!account) { setLoading(false); return; }
    void portalApi.myIdrRoadmap({ instance, account }).then(record => { if (!cancelled) setRoadmap(record); })
      .catch(error => { if (!cancelled) setError(learningErrorMessage(error, "idr")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account?.homeAccountId, instance]);
  return <section className="student-view" aria-label="Individual development roadmap">
    <div className="student-section-heading"><div><p className="student-kicker">Individual development roadmap</p>
      <h2>My career and development plan</h2>
      <p>Your IDR is informed by a separate career and competency assessment, plus your Skunkie learner profile.</p>
    </div></div>
    {loading && <p role="status">Loading your private roadmap…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !roadmap && <div className="student-empty-state"><div><h2>Your IDR has not been created yet</h2>
      <p>Complete learner discovery with Skunkie, then work through your career goals and skills assessment. Your approved roadmap will appear here when available.</p>
    </div></div>}
    {roadmap && <article className="student-panel">
      <h2>{roadmap.targetRole || "Development roadmap"}</h2>
      <p>Review status: {roadmap.reviewState.replaceAll("_", " ")} · Revision {roadmap.revision}</p>
      <h3>Development milestones</h3>
      {roadmap.milestones.length === 0 ? <p>Milestones have not yet been published.</p> :
        <ul>{roadmap.milestones.map(m => <li key={m.id}><strong>{m.title}</strong> — {m.status.replaceAll("_", " ")}; {m.horizonDays}-day horizon</li>)}</ul>}
    </article>}
  </section>;
}

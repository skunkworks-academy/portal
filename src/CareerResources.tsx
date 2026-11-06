import { useEffect, useState, type FormEvent } from "react";
import { useMsal } from "@azure/msal-react";
import { careerApi, careerStatuses, type CareerApplication, type CareerStatus } from "./career-api";

/** Learner-owned application tracker. No CV files or employer submissions occur here. */
export function CareerResources({ profileHref }: { profileHref: string }) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [records, setRecords] = useState<CareerApplication[]>([]);
  const [employer, setEmployer] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!account) { setRecords([]); return; }
    let cancelled = false;
    setBusy(true);
    setError("");
    void careerApi.list({ instance, account })
      .then(items => { if (!cancelled) setRecords(items); })
      .catch(() => { if (!cancelled) setError("Your application records could not be loaded. Retry later; no records have been changed."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [instance, account?.homeAccountId]);

  async function addApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await careerApi.create({ title, employer, url }, { instance, account });
      setRecords(current => [created, ...current]);
      setTitle(""); setEmployer(""); setUrl("");
      setMessage("Opportunity saved to your Academy account. This has not applied for the job.");
    } catch { setError("Could not save the opportunity. Check the details and try again."); }
    finally { setBusy(false); }
  }

  async function changeStatus(item: CareerApplication, status: CareerStatus) {
    if (!account || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await careerApi.update(item.id, status, { instance, account });
      setRecords(current => current.map(record => record.id === updated.id ? updated : record));
      setMessage("Application status updated. This is your own tracking record, not employer-confirmed.");
    } catch { setError("Could not update the status. Reload before retrying."); }
    finally { setBusy(false); }
  }

  async function removeApplication(item: CareerApplication) {
    if (!account || busy || !window.confirm("Remove this saved opportunity from your Academy account?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await careerApi.remove(item.id, { instance, account });
      setRecords(current => current.filter(record => record.id !== item.id));
      setMessage("Application record removed.");
    } catch { setError("Could not remove the application record."); }
    finally { setBusy(false); }
  }

  return <section className="student-view" aria-label="Career and jobs">
    <div className="student-section-heading"><div><p className="student-kicker">Career development</p><h2>Find opportunities and track your progress</h2><p>Discover independent job listings and manage the opportunities you choose to pursue.</p></div></div>
    <div className="student-resource-list">
      <a className="student-resource-card" href="https://jobs.skunkworksacademy.com/" target="_blank" rel="noopener noreferrer"><span>Find jobs</span><div><h3>Job platforms and career channels</h3><p>Explore the Academy directory, including the reviewed vacancy feed when available. Apply through the employer's official channel.</p></div><strong aria-hidden="true">↗</strong></a>
      <a className="student-resource-card" href="https://jobs.skunkworksacademy.com/occupational-trades/" target="_blank" rel="noopener noreferrer"><span>CV toolkit</span><div><h3>Prepare your CV and application</h3><p>Use the free CV builder, checklist and career guidance. Your CV is not uploaded or shared by this tracker.</p></div><strong aria-hidden="true">↗</strong></a>
      <a className="student-resource-card" href={profileHref}><span>My profile</span><div><h3>Academy learner profile</h3><p>Manage your existing learner identity and contact information. No profile data is shared with employers through this feature.</p></div><strong aria-hidden="true">→</strong></a>
    </div>
    <article className="student-panel" aria-label="My application tracker">
      <h3>My application tracker</h3>
      <p>Keep a private, cross-device list in your authenticated Academy account. Statuses are self-reported; external job sites do not update them automatically. This tool does not apply for jobs on your behalf.</p>
      {!account ? <p>Sign in to the Academy portal to save and track your opportunities.</p> : <>
        <form onSubmit={event => { void addApplication(event); }} aria-label="Save a job opportunity" style={{ display: "grid", gap: "12px", maxWidth: "650px", marginBottom: "20px" }}>
          <label>Position title <input value={title} onChange={event => setTitle(event.target.value)} minLength={2} maxLength={140} required placeholder="e.g. Junior Cloud Engineer" style={{ width: "100%" }} /></label>
          <label>Employer <input value={employer} onChange={event => setEmployer(event.target.value)} minLength={2} maxLength={120} required placeholder="Employer name" style={{ width: "100%" }} /></label>
          <label>Official opportunity URL (optional) <input type="url" pattern="https://.*" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://employer.example/jobs/..." style={{ width: "100%" }} /></label>
          <button type="submit" disabled={busy || records.length >= 100}>Save opportunity</button>
        </form>
        {busy && <p role="status">Updating your career tracker…</p>}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {records.length === 0 && !busy && <p>You have no saved opportunities yet. Add one above when you find a vacancy worth pursuing.</p>}
        {records.length > 0 && <div style={{ display: "grid", gap: "12px" }} aria-label="Saved opportunities">
          {records.map(item => <div key={item.id} style={{ border: "1px solid var(--border-color, #cbd5e1)", borderRadius: "12px", padding: "14px" }}>
            <strong>{item.title}</strong><p>{item.employer} · Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
            {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer">Open official job link ↗</a></p>}
            <label>My status <select aria-label={"Application status for " + item.title} value={item.status} disabled={busy} onChange={event => { void changeStatus(item, event.target.value as CareerStatus); }}>
              {careerStatuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select></label>{" "}
            <button type="button" disabled={busy} onClick={() => { void removeApplication(item); }}>Remove</button>
          </div>)}
        </div>}
      </>}
    </article>
  </section>;
}

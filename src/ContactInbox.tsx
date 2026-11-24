import { useState } from "react";
import { portalApi } from "./api";
type Auth = Parameters<typeof portalApi.contactEnquiries>[0];
export function ContactInbox({ auth, isStaff }: { auth: Auth; isStaff: boolean }) {
  const [records, setRecords] = useState<Awaited<ReturnType<typeof portalApi.contactEnquiries>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  async function refresh() {
    setBusy(true); setError("");
    try { setRecords(await portalApi.contactEnquiries(auth)); }
    catch { setRecords(null); setError("Enquiries could not be loaded. Check your staff access and try again."); }
    finally { setBusy(false); }
  }
  return <main className="command-panel" style={{ maxWidth: 1000, margin: "2rem auto", padding: "2rem" }}>
    <a href="/">Back to workspace</a><p className="eyebrow">Private · Academy staff</p><h1>Contact enquiries</h1>
    {!isStaff ? <p role="alert">A staff or administrator account is required.</p> : <>
      <p>Website enquiries, including messages drafted with Skunky. Reply using your approved team mailbox. No automatic emails are sent.</p>
      <button onClick={() => void refresh()} disabled={busy}>{busy ? "Loading…" : "Load / refresh enquiries"}</button>
      <label>Filter by topic <select value={topic} onChange={e => setTopic(e.target.value)}><option value="">All topics</option>{["training", "support", "business", "editorial", "privacy", "legal", "general"].map(t => <option key={t}>{t}</option>)}</select></label>
      {error && <p role="alert">{error}</p>}
      {records && <p role="status">{records.filter(r => !topic || r.topic === topic).length} enquiries</p>}
      {records?.filter(r => !topic || r.topic === topic).map(r => <article key={r.id} style={{ borderTop: "1px solid", marginTop: 24, paddingTop: 16, overflowWrap: "anywhere" }}>
        <h2>{r.topic} · {r.name}</h2><p>{r.email} · {new Date(r.createdAt).toLocaleString()}</p><p style={{ whiteSpace: "pre-wrap" }}>{r.message}</p><small>Reference: {r.id}</small>
      </article>)}
    </>}
  </main>;
}

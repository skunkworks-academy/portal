import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { jobsRequest } from "../api";
import { SKUNKIE_STILL_SRC } from "../SkunkieAvatar";
import { activeStage, localDateKey, metrics, reviewStages, trackerStages, type CareerProfile, type JobEntry, type JobsDashboard, type RecruitmentDashboard, type Vacancy } from "./model";
import "./workspace.css";

type Auth = { instance: IPublicClientApplication; account: AccountInfo };
type Tab = "Overview" | "Vacancies" | "My tracker" | "My profile" | "Recruitment";
type Write = (route: string, method: string, body: object, success: string) => Promise<boolean>;
const directory = "https://jobs.skunkworksacademy.com/";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const dateLabel = (day: string) => new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(day + "T12:00:00"));
function problem(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 409) return "This record changed. Refresh and check the latest version before trying again.";
  if (status === 401 || status === 403) return "Your account could not access this operation. Check the account you used to sign in.";
  if (status === 400) return "Check the information you entered and try again.";
  return "The jobs service could not complete this request. Check your connection and try again.";
}
function TextField({ label, name, initial = "", required = false, type = "text" }: { label: string; name: string; initial?: string; required?: boolean; type?: string }) {
  return <label>{label}<input name={name} type={type} defaultValue={initial} required={required} maxLength={100} /></label>;
}
function ProfileForm({ profile, account, write }: { profile: CareerProfile | null; account: AccountInfo; write: Write }) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await write("/profile", "PUT", { name: value(form, "name"), email: value(form, "email"), location: value(form, "location"),
      target: value(form, "target"), consent: form.has("consent"), version: profile?.version ?? null }, "Your jobs profile was saved.");
  }
  return <section className="jw-panel"><h2>My jobs profile</h2><p>Choose how the Academy can contact you about a vacancy you apply for.</p>
    <form className="jw-form" onSubmit={save}>
      <TextField label="Full name" name="name" initial={profile?.name ?? account.name} required />
      <TextField label="Contact email" name="email" type="email" initial={profile?.email ?? account.username} required />
      <TextField label="Target role" name="target" initial={profile?.target} />
      <TextField label="Location" name="location" initial={profile?.location} />
      <label className="jw-check"><input type="checkbox" name="consent" required /> I agree to Skunkworks Academy storing this profile in its South African Dynamics environment for career tracking and recruitment.</label>
      <div className="jw-actions"><button type="submit">Save profile</button><a href="https://www.skunkworksacademy.com/privacy.html">Privacy and data requests</a></div>
    </form></section>;
}
function TrackerForm({ entry, write, done }: { entry?: JobEntry; write: Write; done: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(["title", "company", "source", "stage", "nextAction", "followUp"].map(key => [key, value(form, key)]));
    const ok = await write(entry ? "/tracker/" + entry.id : "/tracker", entry ? "PATCH" : "POST",
      { ...fields, ...(entry ? { version: entry.version } : { requestId }) }, "Your tracker was updated.");
    if (ok) done();
  }
  return <form onSubmit={save} className="jw-form"><h3>{entry ? "Edit tracked role" : "Track an external role"}</h3>
    <TextField label="Role" name="title" required initial={entry?.title} /><TextField label="Employer" name="company" required initial={entry?.company} />
    <label>Source<input name="source" required maxLength={100} list="jobs-sources" defaultValue={entry?.source} /></label>
    <datalist id="jobs-sources">{["Indeed", "LinkedIn", "PNet", "Careers24", "CareerJunction", "Referral", "Recruitment agency", "Employer website"].map(source => <option key={source}>{source}</option>)}</datalist>
    <label>Stage<select name="stage" defaultValue={entry?.stage ?? "Saved"}>{trackerStages.map(stage => <option key={stage}>{stage}</option>)}</select></label>
    <TextField label="Next action" name="nextAction" initial={entry?.nextAction} /><TextField label="Follow-up date" name="followUp" type="date" initial={entry?.followUp} />
    <div className="jw-actions"><button type="submit">Save tracked role</button><button className="jw-neutral" type="button" onClick={done}>Cancel</button></div>
  </form>;
}
function VacancyForm({ write, done }: { write: Write; done: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (await write("/recruitment/vacancies", "POST", { requestId, ...Object.fromEntries(form) }, "Vacancy published to candidates.")) done();
  }
  return <form className="jw-form" onSubmit={publish}><h3>Publish a vacancy</h3>
    <TextField name="title" label="Job title" required /><TextField name="company" label="Employer" required /><TextField name="location" label="Location or work arrangement" required />
    <label className="jw-wide">Role description<textarea name="summary" rows={4} required maxLength={1000} /></label>
    <div className="jw-actions"><button type="submit">Publish vacancy</button><button type="button" className="jw-neutral" onClick={done}>Cancel</button></div>
  </form>;
}
function Hiring({ data, write }: { data: RecruitmentDashboard; write: Write }) {
  const [adding, setAdding] = useState(false);
  return <><section className="jw-panel"><div className="jw-heading"><h2>Recruitment dashboard</h2><button onClick={() => setAdding(true)}>New vacancy</button></div>
    <p>Review the latest 200 vacancies and 200 applications submitted to Academy recruitment.</p>
    {adding && <VacancyForm write={write} done={() => setAdding(false)} />}
    {data.vacancies.length === 0 && <p>No Academy vacancies have been published.</p>}
    {data.vacancies.map(v => <div className="jw-row" key={v.id}><div><strong>{v.title}</strong><small>{v.company} · {v.location}</small></div>
      {v.open ? <button className="jw-neutral" onClick={() => void write("/recruitment/vacancies/" + v.id, "PATCH", { version: v.version }, "Vacancy closed.")}>Close vacancy</button> : <span>Closed</span>}</div>)}</section>
    <section className="jw-panel"><h2>Submitted applications</h2>{!data.submissions.length && <p>No candidate has submitted an application yet.</p>}
    {data.submissions.map(s => <form className="jw-row" key={s.id + s.version} onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void write("/recruitment/applications/" + s.id, "PATCH", { stage: value(form, "stage"), version: s.version }, "Application stage updated.");
    }}><div><strong>{s.applicant}</strong><small>{s.title} · {s.email}</small></div><label>Application stage<select name="stage" defaultValue={s.stage}>{reviewStages.map(stage => <option key={stage}>{stage}</option>)}</select></label><button type="submit">Update stage</button></form>)}</section></>;
}
function Overview({ data, choose }: { data: JobsDashboard; choose: (tab: Tab) => void }) {
  const counts = metrics(data.entries);
  const upcoming = data.entries.filter(row => row.followUp && activeStage(row.stage)).sort((a,b) => a.followUp.localeCompare(b.followUp));
  const bySource = new Map<string, number>();
  for (const row of data.entries) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
  return <><div className="jw-metrics">{([["Active roles", counts.active], ["At interview", counts.interviews], ["At offer", counts.offers], ["Follow-ups due", counts.due]] as const).map(([label, number]) => <div key={label}><span>{label}</span><strong>{number}</strong></div>)}</div>
    <div className="jw-columns"><section className="jw-panel"><h2>Upcoming actions</h2>
      {!upcoming.length && <p>Add a follow-up date to a tracked role to see your next actions here.</p>}
      {upcoming.slice(0,5).map(a => <div className="jw-row" key={a.id}><div><strong>{a.nextAction || "Follow up"}</strong><small>{a.title} · {a.company}</small></div><span>{a.followUp < localDateKey(new Date()) && "Overdue · "}{dateLabel(a.followUp)}</span></div>)}
      <button className="jw-neutral" onClick={() => choose("My tracker")}>Open my tracker</button></section>
      <section className="jw-panel"><h2>Sources of opportunity</h2>{bySource.size ? [...bySource.entries()].sort((a,b) => b[1]-a[1]).slice(0,5).map(([source,count]) => <div className="jw-source" key={source}><span>{source}</span><meter aria-label={source} min="0" max={data.entries.length} value={count} /><strong>{count}</strong></div>) : <p>Your tracked roles and Academy applications will show which sources you use.</p>}
      <a href={directory + "#directory"}>Browse the jobs directory</a></section></div></>;
}
function Opportunities({ data, write, choose }: { data: JobsDashboard; write: Write; choose: (tab: Tab) => void }) {
  const [selected, setSelected] = useState<Vacancy | null>(null);
  return <section className="jw-panel"><h2>Academy vacancies</h2>{!data.vacancies.length && <p>There are no open Academy vacancies. You can still explore the <a href={directory + "#directory"}>external jobs directory</a>.</p>}
    {data.vacancies.map(v => <article className="jw-vacancy" key={v.id}><h3>{v.title}</h3><small>{v.company} · {v.location}</small><p>{v.summary}</p>
      {data.entries.some(e => e.vacancyId === v.id) ? <strong>Application submitted</strong> : selected?.id === v.id && data.profile ? <form onSubmit={async e => {
        e.preventDefault(); if (await write("/vacancies/" + v.id + "/apply", "POST", { share: true }, "Your application was submitted.")) setSelected(null);
      }}><label className="jw-check"><input type="checkbox" required /> Share my name ({data.profile.name}) and contact email ({data.profile.email}) with Academy recruitment for this vacancy.</label>
      <div className="jw-actions"><button type="submit">Submit application</button><button type="button" className="jw-neutral" onClick={() => setSelected(null)}>Cancel</button></div></form>
      : <button className="jw-neutral" onClick={() => data.profile ? setSelected(v) : choose("My profile")}>{data.profile ? "Review application" : "Create profile to apply"}</button>}</article>)}</section>;
}
export function JobsWorkspace({ auth, onSignOut }: { auth: Auth; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<JobsDashboard | null>(null);
  const [hiring, setHiring] = useState<RecruitmentDashboard | null>(null);
  const [edit, setEdit] = useState<JobEntry | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const current = useRef(true);
  const { instance, account } = auth;
  const get = useCallback(<T,>(path: string, signal: AbortSignal) => jobsRequest<T>(path, { signal, cache: "no-store" }, { account, instance }), [instance, account]);
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  useEffect(() => {
    const c = new AbortController();
    setError(""); setBusy(true);
    async function reload() {
      try {
        const next = await get<JobsDashboard>("", c.signal);
        if (c.signal.aborted) return;
        setData(next);
        if (tab === "Recruitment" && next.recruiter) {
          const hr = await get<RecruitmentDashboard>("/recruitment", c.signal);
          if (!c.signal.aborted) setHiring(hr);
        } else setHiring(null);
      } catch (e) { if (!c.signal.aborted) { setData(null); setHiring(null); setError(problem(e)); } }
      finally { if (!c.signal.aborted) setBusy(false); }
    }
    void reload(); return () => c.abort();
  }, [get, revision, tab === "Recruitment"]);
  const write: Write = async (path, method, body, success) => {
    if (lock.current || busy) return false;
    lock.current = true; setBusy(true); setNotice(""); setError("");
    try {
      await jobsRequest<void>(path, { method, body: JSON.stringify(body) }, auth);
      if (current.current) { setNotice(success); setRevision(n => n + 1); }
      return true;
    } catch (e) { if (current.current) { setError(problem(e)); setBusy(false); } return false; }
    finally { lock.current = false; }
  };
  const tabs: Tab[] = ["Overview", "Vacancies", "My tracker", "My profile"];
  if (data?.recruiter) tabs.push("Recruitment");
  return <main className="jobs-workspace" id="main"><div className="jw-intro"><div><a href={directory}>Academy Jobs</a><h1>Career workspace</h1><p>{account.name ? "Signed in as " + account.name : "Your signed-in jobs dashboard"}</p></div>
    <button className="jw-neutral" onClick={onSignOut}>Sign out</button></div>
    <aside className="jw-coach">
      <img src={SKUNKIE_STILL_SRC} width="64" height="84" alt="" />
      <div><h2>Skunkie AI learning companion</h2><p>Practise an interview, tailor your CV or plan your next follow-up.</p></div>
      <button id="jobs-open-skunkie" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event("academy:open-jobs-companion"))}>Ask Skunkie</button>
    </aside>
    <nav aria-label="Career workspace" className="jw-tabs">{tabs.map(item => <button key={item} aria-current={item === tab ? "page" : undefined} onClick={() => { setTab(item); setEdit(null); }}>{item}</button>)}</nav>
    {notice && <p className="jw-notice" role="status">{notice}</p>}{error && <div className="jw-error" role="alert">{error} <button className="jw-neutral" onClick={() => { setEdit(null); setRevision(n => n+1); }}>Refresh</button></div>}
    {busy && <p role="status">Updating your workspace…</p>}
    {data && <fieldset className="jw-content" disabled={busy}><legend className="sr-only">{tab}</legend>
      {!data.profile && tab !== "My profile" && <div className="jw-callout"><span>Create your jobs profile to track a role or apply for an Academy vacancy.</span><button onClick={() => setTab("My profile")}>Create profile</button></div>}
      {tab === "Overview" && <Overview data={data} choose={setTab} />}
      {tab === "My profile" && <ProfileForm key={data.profile?.version ?? "new"} account={account} profile={data.profile} write={write} />}
      {tab === "Vacancies" && <Opportunities data={data} write={write} choose={setTab} />}
      {tab === "My tracker" && <section className="jw-panel"><div className="jw-heading"><div><h2>My application tracker</h2><p>Track opportunities privately. Apply for external roles on the employer’s website.</p></div>
        {data.profile && <button onClick={() => setEdit("new")}>Track a role</button>}</div>
        {edit && <TrackerForm key={edit === "new" ? "new" : edit.id + edit.version} entry={edit === "new" ? undefined : edit} done={() => setEdit(null)} write={write} />}
        {!data.entries.length && <p>You haven’t tracked or applied for a role yet.</p>}
        {data.entries.map(e => <div className="jw-row" key={e.id}><div><strong>{e.title}</strong><small>{e.company} · {e.source}</small>{e.nextAction && <small>{e.nextAction}{e.followUp && " · " + dateLabel(e.followUp)}</small>}</div>
          <span>{e.stage}</span>{!e.vacancyId && <button className="jw-neutral" onClick={() => setEdit(e)}>Edit<span className="sr-only"> {e.title}</span></button>}</div>)}</section>}
      {tab === "Recruitment" && data.recruiter && hiring && <Hiring data={hiring} write={write} />}
    </fieldset>}
    <footer className="jw-footer"><a href={directory + "workspace/#career-tools"}>Career tools and pay research</a><a href="https://www.skunkworksacademy.com/privacy.html">Privacy and data requests</a></footer>
  </main>;
}

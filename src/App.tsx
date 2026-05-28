import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { loginRequest, skunkworksTenantId } from "./authConfig";
import { portalApi } from "./api";
import type { ApplicationRecord, ApplicationStatus, JobInput, JobPosting, NewApplication, OnboardingTask, UserProfile } from "./types";

type Tab = "jobs" | "apply" | "my" | "admin";

const fallbackJobs: JobPosting[] = [
  {
    id: "preset-ai-facilitator",
    title: "AI Tools Facilitator",
    programme: "Applied AI Short Course",
    modality: "Remote",
    rateBand: "To be confirmed",
    closingDate: "",
    status: "Live",
    description: "Guide learners through practical AI tools, prompt workflows, responsible use, and workplace automation.",
    applicants: 0
  },
  {
    id: "preset-cybersecurity-instructor",
    title: "Cybersecurity Instructor",
    programme: "Security Analyst Academy",
    modality: "Hybrid",
    rateBand: "To be confirmed",
    closingDate: "",
    status: "Live",
    description: "Lead security fundamentals, labs, incident response exercises, and learner capstone assessment.",
    applicants: 0
  },
  {
    id: "preset-cloud-labs-coach",
    title: "Cloud Labs Coach",
    programme: "Cloud Practitioner Track",
    modality: "On campus",
    rateBand: "To be confirmed",
    closingDate: "",
    status: "Live",
    description: "Support learners through cloud fundamentals, hands-on deployments, and practical troubleshooting labs.",
    applicants: 0
  }
];

const disciplineOptions = [
  "AI Foundations",
  "Applied AI Tools",
  "Cybersecurity",
  "Cloud Engineering",
  "Data Analytics",
  "Software Development",
  "Project Management",
  "Business Analysis",
  "DevOps",
  "UI/UX Design"
];

const emptyJob: JobInput = {
  title: "",
  programme: "",
  modality: "Hybrid",
  rateBand: "",
  closingDate: "",
  status: "Draft",
  description: ""
};

function getProfile(account?: AccountInfo | null): UserProfile | null {
  if (!account) return null;
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;
  const roles = Array.isArray(claims?.roles) ? (claims.roles as string[]) : [];
  const tenantId = typeof claims?.tid === "string" ? claims.tid : account.tenantId;
  return {
    name: account.name ?? account.username,
    username: account.username,
    tenantId,
    roles,
    isAdmin: tenantId === skunkworksTenantId && roles.includes("Portal.Admin")
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function App() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const profile = useMemo(() => getProfile(account), [account]);
  const auth = account ? { instance, account } : undefined;
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [adminApplications, setAdminApplications] = useState<ApplicationRecord[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [jobDraft, setJobDraft] = useState<JobInput>(emptyJob);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshJobs() {
    let nextJobs: JobPosting[];
    try {
      nextJobs = await portalApi.jobs();
    } catch {
      nextJobs = fallbackJobs;
    }
    if (nextJobs.length === 0) nextJobs = fallbackJobs;
    setJobs(nextJobs);
    if (!selectedJobId && nextJobs[0]) setSelectedJobId(nextJobs[0].id);
  }

  async function refreshUserData() {
    if (!auth) return;
    setApplications(await portalApi.myApplications(auth));
  }

  async function refreshAdminData() {
    if (!auth || !profile?.isAdmin) return;
    const [nextApplications, nextTasks] = await Promise.all([
      portalApi.adminApplications(auth),
      portalApi.adminTasks(auth)
    ]);
    setAdminApplications(nextApplications);
    setTasks(nextTasks);
  }

  function friendlyError(err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    if (message.includes("404")) {
      return "The portal API endpoint was not found. Confirm the Azure Functions API deployment succeeded and that the Function App shows the getJobs route.";
    }
    return message;
  }

  async function run(action: () => Promise<void>, success?: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (success) setNotice(success);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run(refreshJobs);
  }, []);

  useEffect(() => {
    if (account && tab === "my") run(refreshUserData);
  }, [account?.homeAccountId, tab]);

  useEffect(() => {
    if (profile?.isAdmin && tab === "admin") run(refreshAdminData);
  }, [profile?.isAdmin, account?.homeAccountId, tab]);

  async function signIn() {
    await instance.loginRedirect(loginRequest);
  }

  async function signOut() {
    await instance.logoutRedirect();
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) {
      await signIn();
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("resume") as File | null;
    const payload: NewApplication = {
      jobId: String(data.get("jobId")),
      applicantName: String(data.get("applicantName")),
      applicantEmail: String(data.get("applicantEmail")),
      phone: String(data.get("phone")),
      discipline: String(data.get("discipline")),
      availability: String(data.get("availability")),
      experience: String(data.get("experience")),
      resumeFileName: file?.name || undefined,
      resumeBase64: file && file.size > 0 ? await readFileAsBase64(file) : undefined
    };
    await run(async () => {
      await portalApi.submitApplication(payload, auth);
      form.reset();
      await Promise.all([refreshJobs(), refreshUserData()]);
    }, "Application submitted.");
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    await run(async () => {
      await portalApi.createJob(jobDraft, auth);
      setJobDraft(emptyJob);
      await refreshJobs();
    }, "Job posting saved.");
  }

  async function updateApplication(id: string, status: ApplicationStatus, owner: string) {
    if (!auth) return;
    await run(async () => {
      await portalApi.updateApplication(id, { status, owner }, auth);
      await refreshAdminData();
    }, "Application updated.");
  }

  async function advanceTask(task: OnboardingTask) {
    if (!auth) return;
    const nextStatus = task.status === "Due" ? "InProgress" : task.status === "InProgress" ? "Ready" : "Complete";
    await run(async () => {
      await portalApi.updateTask(task.id, { status: nextStatus }, auth);
      await refreshAdminData();
    }, "Task updated.");
  }

  const liveJobs = jobs.filter((job) => job.status === "Live");
  const displayJobs = liveJobs.length ? liveJobs : fallbackJobs;
  const selectedJob = displayJobs.find((job) => job.id === selectedJobId) ?? displayJobs[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SA</div>
          <div>
            <strong>Skunkworks Academy</strong>
            <span>Instructor Portal</span>
          </div>
        </div>
        <nav>
          <button className={tab === "jobs" ? "active" : ""} onClick={() => setTab("jobs")}>Jobs</button>
          <button className={tab === "apply" ? "active" : ""} onClick={() => setTab("apply")}>Apply</button>
          {profile && <button className={tab === "my" ? "active" : ""} onClick={() => setTab("my")}>My Applications</button>}
          {profile?.isAdmin && <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>Admin</button>}
        </nav>
        <div className="identity">
          {profile ? (
            <>
              <strong>{profile.name}</strong>
              <span>{profile.username}</span>
              {profile.isAdmin && <em>Portal.Admin</em>}
              <button onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <strong>Applicant access</strong>
              <span>Sign in with a Microsoft work, school, or personal account.</span>
              <button onClick={signIn}>Sign in</button>
            </>
          )}
        </div>
      </aside>
      <main>
        <header className="hero">
          <div>
            <p>Instructor onboarding and job posting</p>
            <h1>Recruit, approve, and onboard instructors with Microsoft identity and SharePoint records.</h1>
          </div>
          <div className="hero-metrics">
            <div><span>Live roles</span><strong>{liveJobs.length}</strong></div>
            <div><span>Applications</span><strong>{profile?.isAdmin ? adminApplications.length : applications.length}</strong></div>
            <div><span>Tasks</span><strong>{tasks.length}</strong></div>
          </div>
        </header>

        {(notice || error) && <div className={error ? "alert error" : "alert"}>{error || notice}</div>}

        {tab === "jobs" && (
          <section>
            <div className="section-head">
              <h2>Open instructor roles</h2>
              <button onClick={() => setTab("apply")}>Apply now</button>
            </div>
            <div className="card-grid">
              {displayJobs.map((job) => (
                <article className="card" key={job.id}>
                  <div className="card-title">
                    <h3>{job.title}</h3>
                    <span className="pill">{job.modality}</span>
                  </div>
                  <p>{job.description}</p>
                  <dl>
                    <div><dt>Programme</dt><dd>{job.programme}</dd></div>
                    <div><dt>Rate</dt><dd>{job.rateBand || "To be confirmed"}</dd></div>
                    <div><dt>Closing</dt><dd>{job.closingDate || "Open until filled"}</dd></div>
                  </dl>
                  <button onClick={() => { setSelectedJobId(job.id); setTab("apply"); }}>Apply for this role</button>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "apply" && (
          <section className="form-panel">
            <div className="section-head">
              <h2>Submit instructor application</h2>
              {!profile && <button onClick={signIn}>Sign in to submit</button>}
            </div>
            <form onSubmit={submitApplication}>
              <label>Role<select name="jobId" value={selectedJob?.id ?? displayJobs[0]?.id ?? ""} onChange={(event) => setSelectedJobId(event.target.value)} required>
                {displayJobs.map((job) => <option key={job.id} value={job.id}>{job.title} - {job.programme}</option>)}
              </select></label>
              <label>Name<input name="applicantName" autoComplete="name" defaultValue={profile?.name ?? ""} required /></label>
              <label>Email<input name="applicantEmail" type="email" autoComplete="email" defaultValue={profile?.username ?? ""} required /></label>
              <label>Phone<input name="phone" autoComplete="tel" required /></label>
              <label>Discipline<input name="discipline" list="discipline-options" value={discipline} onChange={(event) => setDiscipline(event.target.value)} autoComplete="organization-title" required /></label>
              <datalist id="discipline-options">
                {disciplineOptions.map((option) => <option value={option} key={option} />)}
              </datalist>
              <label>Availability<select name="availability"><option>Weekdays</option><option>Evenings</option><option>Weekends</option><option>Flexible</option></select></label>
              <div className="discipline-picks full" aria-label="Common disciplines">
                {disciplineOptions.map((option) => (
                  <button type="button" className={discipline === option ? "selected" : ""} onClick={() => setDiscipline(option)} key={option}>
                    {option}
                  </button>
                ))}
              </div>
              <label className="full">Experience<textarea name="experience" required placeholder="Summarize teaching experience, certifications, and learner groups." /></label>
              <label className="full">Resume or certificate<input name="resume" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" /></label>
              <button disabled={loading || displayJobs.length === 0}>{loading ? "Working..." : "Submit application"}</button>
            </form>
          </section>
        )}

        {tab === "my" && (
          <section>
            <h2>My applications</h2>
            <DataTable
              headers={["Role", "Status", "Submitted", "Owner"]}
              rows={applications.map((item) => [item.jobTitle, item.status, new Date(item.submittedAt).toLocaleDateString(), item.owner || "Unassigned"])}
            />
          </section>
        )}

        {tab === "admin" && profile?.isAdmin && (
          <section className="admin-grid">
            <div className="form-panel">
              <h2>Create job posting</h2>
              <form onSubmit={createJob}>
                <label>Title<input autoComplete="off" value={jobDraft.title} onChange={(event) => setJobDraft({ ...jobDraft, title: event.target.value })} required /></label>
                <label>Programme<input autoComplete="off" value={jobDraft.programme} onChange={(event) => setJobDraft({ ...jobDraft, programme: event.target.value })} required /></label>
                <label>Modality<select value={jobDraft.modality} onChange={(event) => setJobDraft({ ...jobDraft, modality: event.target.value })}><option>Hybrid</option><option>Remote</option><option>On campus</option></select></label>
                <label>Rate band<input autoComplete="off" value={jobDraft.rateBand} onChange={(event) => setJobDraft({ ...jobDraft, rateBand: event.target.value })} /></label>
                <label>Closing date<input type="date" value={jobDraft.closingDate} onChange={(event) => setJobDraft({ ...jobDraft, closingDate: event.target.value })} /></label>
                <label>Status<select value={jobDraft.status} onChange={(event) => setJobDraft({ ...jobDraft, status: event.target.value as JobInput["status"] })}><option>Draft</option><option>Live</option><option>Closed</option></select></label>
                <label className="full">Description<textarea value={jobDraft.description} onChange={(event) => setJobDraft({ ...jobDraft, description: event.target.value })} required /></label>
                <button disabled={loading}>Save posting</button>
              </form>
            </div>

            <div>
              <h2>Applicant queue</h2>
              <div className="stack">
                {adminApplications.map((item) => (
                  <article className="card compact" key={item.id}>
                    <div className="card-title">
                      <h3>{item.applicantName}</h3>
                      <span className="pill">{item.status}</span>
                    </div>
                    <p>{item.jobTitle} · {item.applicantEmail}</p>
                    <div className="inline-fields">
                      <select defaultValue={item.status} id={`status-${item.id}`}>
                        <option>Submitted</option><option>Screening</option><option>Interview</option><option>Offer</option><option>Rejected</option>
                      </select>
                      <input autoComplete="off" defaultValue={item.owner} placeholder="Owner" id={`owner-${item.id}`} />
                      <button onClick={() => updateApplication(
                        item.id,
                        (document.getElementById(`status-${item.id}`) as HTMLSelectElement).value as ApplicationStatus,
                        (document.getElementById(`owner-${item.id}`) as HTMLInputElement).value
                      )}>Update</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h2>Onboarding tasks</h2>
              <div className="stack">
                {tasks.map((task) => (
                  <article className="card compact" key={task.id}>
                    <div className="card-title">
                      <h3>{task.title}</h3>
                      <span className="pill">{task.status}</span>
                    </div>
                    <p>{task.candidateName} · {task.detail}</p>
                    <button onClick={() => advanceTask(task)}>Advance task</button>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
        <footer className="legal-footer">
          <a href="/termsofservice/">Terms of Service</a>
          <a href="/privacystatement/">Privacy Statement</a>
        </footer>
      </main>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>) : (
            <tr><td colSpan={headers.length}>No records yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

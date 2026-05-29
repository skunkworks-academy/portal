import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { loginRequest, skunkworksTenantId } from "./authConfig";
import { portalApi } from "./api";
import { canAccess, classSchedule, courseCatalog, landingRoles, roleDefinitions, type Tab } from "./roles";
import type { ApplicationRecord, ApplicationStatus, ClassInput, ClassRegistrationRecord, ClassSession, CourseRecord, JobInput, JobPosting, NewApplication, OnboardingTask, PortalHealth, PortalProfile, PortalProfileInput, PortalRole, UserProfile } from "./types";

const fallbackJobs: JobPosting[] = [
  { id: "preset-ai-facilitator", title: "AI Tools Facilitator", programme: "Applied AI Short Course", modality: "Remote", rateBand: "To be confirmed", closingDate: "", status: "Live", description: "Guide learners through practical AI tools, prompt workflows, responsible use, and workplace automation.", applicants: 0 },
  { id: "preset-cybersecurity-instructor", title: "Cybersecurity Instructor", programme: "Security Analyst Academy", modality: "Hybrid", rateBand: "To be confirmed", closingDate: "", status: "Live", description: "Lead security fundamentals, labs, incident response exercises, and learner capstone assessment.", applicants: 0 },
  { id: "preset-cloud-labs-coach", title: "Cloud Labs Coach", programme: "Cloud Practitioner Track", modality: "On campus", rateBand: "To be confirmed", closingDate: "", status: "Live", description: "Support learners through cloud fundamentals, hands-on deployments, and practical troubleshooting labs.", applicants: 0 }
];

const fallbackCourses: CourseRecord[] = courseCatalog.map((course) => ({ ...course, status: "Live" }));
const fallbackClasses: ClassSession[] = classSchedule.map((item) => ({ ...item, courseTitle: courseCatalog.find((course) => course.id === item.courseId)?.title ?? item.title, modality: "Hybrid", enrolled: 0, status: "Open" }));

const disciplineOptions = ["AI Foundations", "Applied AI Tools", "Cybersecurity", "Cloud Engineering", "Data Analytics", "Software Development", "Project Management", "Business Analysis", "DevOps", "UI/UX Design"];
const setupSteps = ["Microsoft sign-in configured", "Azure Functions API deployed", "SharePoint site connected", "Admin roles assigned", "Teams app package prepared"];
const emptyJob: JobInput = { title: "", programme: "", modality: "Hybrid", rateBand: "", closingDate: "", status: "Draft", description: "" };
const emptyClass: ClassInput = { courseId: "", courseTitle: "", title: "", schedule: "", modality: "Hybrid", instructor: "", seats: 20, status: "Open" };

function emptyPortalProfile(role: PortalRole, profile?: UserProfile | null): PortalProfileInput {
  return { displayName: profile?.name ?? "", portalRole: role, phone: "", location: "", bio: "", cvFileName: "" };
}

function roleFromClaims(roles: string[], groups: string[], isAdmin: boolean): PortalRole {
  const claims = [...roles, ...groups].map((claim) => claim.toLowerCase());
  if (isAdmin || claims.some((claim) => claim.includes("portal.staff") || claim.includes("staff"))) return "Staff";
  if (claims.some((claim) => claim.includes("portal.student") || claim.includes("student"))) return "Student";
  return "Instructor";
}

function getProfile(account?: AccountInfo | null): UserProfile | null {
  if (!account) return null;
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;
  const roles = Array.isArray(claims?.roles) ? (claims.roles as string[]) : [];
  const groups = Array.isArray(claims?.groups) ? (claims.groups as string[]) : [];
  const tenantId = typeof claims?.tid === "string" ? claims.tid : account.tenantId;
  const isAdmin = tenantId === skunkworksTenantId && (roles.includes("Portal.Admin") || roles.includes("Portal.Staff"));
  return { name: account.name ?? account.username, username: account.username, tenantId, roles, isAdmin, portalRole: roleFromClaims(roles, groups, isAdmin) };
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
  const [roleOverride, setRoleOverride] = useState<PortalRole>(() => {
    const stored = localStorage.getItem("portalRoleOverride");
    return stored === "Student" || stored === "Instructor" || stored === "Staff" ? stored : "Instructor";
  });
  const activeRole = import.meta.env.DEV ? roleOverride : profile?.portalRole ?? roleOverride;
  const roleContent = roleDefinitions[activeRole];
  const auth = account ? { instance, account } : undefined;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>(fallbackCourses);
  const [classes, setClasses] = useState<ClassSession[]>(fallbackClasses);
  const [classRegistrations, setClassRegistrations] = useState<ClassRegistrationRecord[]>([]);
  const [allClassRegistrations, setAllClassRegistrations] = useState<ClassRegistrationRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [adminApplications, setAdminApplications] = useState<ApplicationRecord[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<PortalProfile[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [jobDraft, setJobDraft] = useState<JobInput>(emptyJob);
  const [classDraft, setClassDraft] = useState<ClassInput>(emptyClass);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState<PortalHealth | null>(null);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
  const [editableProfile, setEditableProfile] = useState<PortalProfileInput>(() => emptyPortalProfile(roleOverride));
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshJobs() {
    let nextJobs: JobPosting[];
    try { nextJobs = await portalApi.jobs(); } catch { nextJobs = fallbackJobs; }
    if (nextJobs.length === 0) nextJobs = fallbackJobs;
    setJobs(nextJobs);
    if (!selectedJobId && nextJobs[0]) setSelectedJobId(nextJobs[0].id);
  }

  async function refreshAcademicData() {
    try {
      const [nextCourses, nextClasses] = await Promise.all([portalApi.courses(), portalApi.classes()]);
      setCourses(nextCourses.length ? nextCourses : fallbackCourses);
      setClasses(nextClasses.length ? nextClasses : fallbackClasses);
    } catch {
      setCourses(fallbackCourses);
      setClasses(fallbackClasses);
    }
  }

  async function refreshStudentData() {
    if (!auth) return;
    setClassRegistrations(await portalApi.myClasses(auth));
  }

  async function refreshUserData() {
    if (!auth) return;
    setApplications(await portalApi.myApplications(auth));
  }

  async function refreshAdminData() {
    if (!auth || !profile?.isAdmin) return;
    const [nextApplications, nextTasks, nextProfiles, nextRegistrations] = await Promise.all([
      portalApi.adminApplications(auth), portalApi.adminTasks(auth), portalApi.adminProfiles(auth), portalApi.adminClassRegistrations(auth)
    ]);
    setAdminApplications(nextApplications);
    setTasks(nextTasks);
    setAdminProfiles(nextProfiles);
    setAllClassRegistrations(nextRegistrations);
  }

  async function refreshProfile() {
    if (!auth || !profile) return;
    const saved = await portalApi.myProfile(auth);
    setEditableProfile(saved ? { displayName: saved.displayName || profile.name, portalRole: saved.portalRole, phone: saved.phone, location: saved.location, bio: saved.bio, cvFileName: saved.cvFileName } : emptyPortalProfile(activeRole, profile));
  }

  function friendlyError(err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    if (message.includes("404")) return "The portal API endpoint was not found. Confirm the Azure Functions deployment and route indexing.";
    if (message.includes("Missing required setting")) return "The portal API is online but missing a required Azure Function App setting. Check /api/health.";
    if (message.includes("SharePoint list") || message.includes("SharePoint library")) return "SharePoint is connected, but the required portal list or library is missing. Run provisioning.";
    return message;
  }

  async function run(action: () => Promise<void>, success?: string) {
    setLoading(true); setError(""); setNotice("");
    try { await action(); if (success) setNotice(success); } catch (err) { setError(friendlyError(err)); } finally { setLoading(false); }
  }

  useEffect(() => { run(async () => { await Promise.all([refreshJobs(), refreshAcademicData()]); }); portalApi.health().then(setHealth).catch(() => undefined); }, []);
  useEffect(() => { if (!canAccess(activeRole, tab, Boolean(profile?.isAdmin))) setTab("dashboard"); }, [activeRole, profile?.isAdmin, tab]);
  useEffect(() => { if (account) run(refreshProfile); }, [account?.homeAccountId]);
  useEffect(() => { if (account && activeRole === "Student") run(refreshStudentData); }, [account?.homeAccountId, activeRole]);
  useEffect(() => { if (account && activeRole === "Instructor" && tab === "applications") run(refreshUserData); }, [account?.homeAccountId, activeRole, tab]);
  useEffect(() => { if (profile?.isAdmin && ["staff", "applications", "instructors", "students", "settings", "classes"].includes(tab)) run(refreshAdminData); }, [profile?.isAdmin, account?.homeAccountId, tab]);

  async function signIn(nextRole?: PortalRole) { if (nextRole) changeRole(nextRole); await instance.loginRedirect(loginRequest); }
  async function signOut() { await instance.logoutRedirect(); }
  function openTab(nextTab: Tab) { if (canAccess(activeRole, nextTab, Boolean(profile?.isAdmin))) setTab(nextTab); setMenuOpen(false); }
  function changeRole(role: PortalRole) { localStorage.setItem("portalRoleOverride", role); setRoleOverride(role); setEditableProfile((current) => ({ ...current, portalRole: role })); setTab("dashboard"); }
  function toggleSavedJob(jobId: string) { setSavedJobIds((current) => current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]); }

  async function registerClass(classId: string) {
    if (!auth) { await signIn("Student"); return; }
    await run(async () => { await portalApi.registerClass(classId, auth); await Promise.all([refreshAcademicData(), refreshStudentData()]); }, "Class registration saved.");
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) { await signIn("Instructor"); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("resume") as File | null;
    const payload: NewApplication = {
      jobId: String(data.get("jobId")), applicantName: String(data.get("applicantName")), applicantEmail: String(data.get("applicantEmail")), phone: String(data.get("phone")), discipline: String(data.get("discipline")), availability: String(data.get("availability")), experience: String(data.get("experience")), resumeFileName: file?.name || undefined, resumeBase64: file && file.size > 0 ? await readFileAsBase64(file) : undefined
    };
    await run(async () => { await portalApi.submitApplication(payload, auth); form.reset(); await Promise.all([refreshJobs(), refreshUserData()]); }, "Application submitted.");
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth || !profile?.isAdmin) return;
    await run(async () => { await portalApi.createJob(jobDraft, auth); setJobDraft(emptyJob); await refreshJobs(); }, "Job posting saved.");
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth || !profile?.isAdmin) return;
    await run(async () => { await portalApi.createClass(classDraft, auth); setClassDraft(emptyClass); await refreshAcademicData(); }, "Class scheduled.");
  }

  async function updateApplication(id: string, status: ApplicationStatus, owner: string) {
    if (!auth || !profile?.isAdmin) return;
    await run(async () => { await portalApi.updateApplication(id, { status, owner }, auth); await refreshAdminData(); }, "Application updated.");
  }

  async function advanceTask(task: OnboardingTask) {
    if (!auth || !profile?.isAdmin) return;
    const nextStatus = task.status === "Due" ? "InProgress" : task.status === "InProgress" ? "Ready" : "Complete";
    await run(async () => { await portalApi.updateTask(task.id, { status: nextStatus }, auth); await refreshAdminData(); }, "Task updated.");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth) return;
    await run(async () => {
      const saved = await portalApi.updateProfile({ ...editableProfile, portalRole: activeRole, cvFileName: cvFile?.name || editableProfile.cvFileName, cvBase64: cvFile ? await readFileAsBase64(cvFile) : undefined }, auth);
      setEditableProfile({ displayName: saved.displayName, portalRole: saved.portalRole, phone: saved.phone, location: saved.location, bio: saved.bio, cvFileName: saved.cvFileName });
      setCvFile(null);
    }, "Profile updated.");
  }

  const liveJobs = jobs.filter((job) => job.status === "Live");
  const displayJobs = liveJobs.length ? liveJobs : fallbackJobs;
  const selectedJob = displayJobs.find((job) => job.id === selectedJobId) ?? displayJobs[0];
  const setupComplete = health ? setupSteps.length - health.missingSettings.length : 2;
  const registeredClassIds = classRegistrations.filter((item) => item.status !== "Cancelled").map((item) => item.classId);
  const enrolledClasses = classes.filter((item) => registeredClassIds.includes(item.id));
  const pipelineCount = profile?.isAdmin ? adminApplications.length : applications.length;
  const instructorProfiles = adminProfiles.filter((item) => item.portalRole === "Instructor");
  const studentProfiles = adminProfiles.filter((item) => item.portalRole === "Student");

  if (!profile) return <LandingPage signIn={signIn} selectRole={changeRole} selectedRole={roleOverride} liveJobs={displayJobs.length} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark" aria-hidden="true">SA</div><div><strong>Skunkworks Academy</strong><span>Portal</span></div></div>
        <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>Menu</button>
        <nav className={menuOpen ? "open" : ""}>{roleContent.nav.map((item) => <button className={tab === item.tab ? "active" : ""} onClick={() => openTab(item.tab)} key={item.tab}>{item.label}</button>)}</nav>
        <div className="identity"><strong>{profile.name}</strong><span>{profile.username}</span><em>{profile.isAdmin ? "Portal.Admin" : activeRole}</em><button onClick={signOut}>Sign out</button></div>
      </aside>

      <main>
        <header className="hero">
          <div><p>{activeRole} workspace</p><h1>{roleContent.headline}</h1><span className="hero-copy">{roleContent.summary}</span></div>
          <div className="hero-metrics"><div><span>Courses</span><strong>{courses.length}</strong></div><div><span>{activeRole === "Student" ? "My classes" : "Pipeline"}</span><strong>{activeRole === "Student" ? enrolledClasses.length : pipelineCount}</strong></div><div><span>{activeRole === "Instructor" ? "Saved jobs" : "Profiles"}</span><strong>{activeRole === "Instructor" ? savedJobIds.length : activeRole === "Staff" ? adminProfiles.length : liveJobs.length}</strong></div></div>
        </header>

        {(notice || error) && <div className={error ? "alert error" : "alert"}>{error || notice}</div>}
        {health && health.missingSettings.length > 0 && <div className="alert warning">API setup is almost complete. Missing Azure setting: {health.missingSettings.join(", ")}.</div>}
        {tab === "dashboard" && <Dashboard activeRole={activeRole} setupComplete={setupComplete} changeRole={changeRole} />}
        {tab === "courses" && <CourseCatalog courses={courses} />}
        {tab === "classes" && activeRole === "Staff" && <StaffClassScheduling courses={courses} classes={classes} registrations={allClassRegistrations} classDraft={classDraft} setClassDraft={setClassDraft} createClass={createClass} loading={loading} />}
        {tab === "classes" && activeRole !== "Staff" && <ClassWorkspace activeRole={activeRole} classes={classes} registeredClassIds={registeredClassIds} registerForClass={registerClass} />}
        {tab === "register" && <ClassRegistration classes={classes} registeredClassIds={registeredClassIds} registerForClass={registerClass} />}
        {tab === "jobs" && <Jobs jobs={displayJobs} savedJobIds={savedJobIds} toggleSavedJob={toggleSavedJob} selectJob={(id) => { setSelectedJobId(id); openTab(activeRole === "Staff" ? "staff" : "applications"); }} activeRole={activeRole} />}
        {tab === "applications" && activeRole === "Instructor" && <InstructorApplications profile={profile} applications={applications} displayJobs={displayJobs} selectedJobId={selectedJob?.id ?? ""} setSelectedJobId={setSelectedJobId} discipline={discipline} setDiscipline={setDiscipline} loading={loading} submitApplication={submitApplication} refresh={() => run(refreshUserData)} />}
        {tab === "applications" && activeRole === "Staff" && <StaffApplications profile={profile} applications={adminApplications} updateApplication={updateApplication} refresh={() => run(refreshAdminData)} />}
        {tab === "staff" && <StaffOperations profile={profile} jobDraft={jobDraft} setJobDraft={setJobDraft} createJob={createJob} tasks={tasks} advanceTask={advanceTask} loading={loading} />}
        {tab === "instructors" && <StaffProfiles title="Instructor Profiles" profiles={instructorProfiles} profile={profile} emptyText="No instructor profiles have been saved yet." />}
        {tab === "students" && <StaffProfiles title="Student Profiles" profiles={studentProfiles} profile={profile} emptyText="No student profiles have been saved yet." />}
        {tab === "settings" && <StaffSettings profile={profile} health={health} refresh={() => run(refreshAdminData)} />}
        {tab === "resources" && <Resources activeRole={activeRole} />}
        {tab === "profile" && <ProfileEditor activeRole={activeRole} profile={profile} editableProfile={editableProfile} setEditableProfile={setEditableProfile} setCvFile={setCvFile} saveProfile={saveProfile} />}
        <footer className="legal-footer"><a href="/termsofservice/">Terms of Service</a><a href="/privacystatement/">Privacy Statement</a></footer>
      </main>
    </div>
  );
}

function Dashboard({ activeRole, setupComplete, changeRole }: { activeRole: PortalRole; setupComplete: number; changeRole: (role: PortalRole) => void }) {
  const roleContent = roleDefinitions[activeRole];
  return <section className="dashboard-grid"><div className="command-panel"><div className="section-head"><h2>Role Access</h2><span className="pill">{activeRole}</span></div><div className="timeline">{roleContent.capabilities.map((item) => <div key={item}><strong>{item}</strong><span>Available in the {activeRole.toLowerCase()} workspace.</span></div>)}</div></div><div className="command-panel"><div className="section-head"><h2>Setup Status</h2><span className="pill">{setupComplete}/{setupSteps.length}</span></div><div className="setup-list">{setupSteps.map((step, index) => <div className={index < setupComplete ? "complete" : ""} key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}</div></div>{import.meta.env.DEV && <div className="command-panel wide"><div className="section-head"><h2>Development Role Preview</h2><span className="pill">Not production auth</span></div><div className="role-switcher">{(["Student", "Instructor", "Staff"] as PortalRole[]).map((role) => <button className={activeRole === role ? "selected" : ""} onClick={() => changeRole(role)} key={role}>{role}</button>)}</div></div>}</section>;
}

function LandingPage({ signIn, selectRole, selectedRole, liveJobs }: { signIn: (role?: PortalRole) => Promise<void>; selectRole: (role: PortalRole) => void; selectedRole: PortalRole; liveJobs: number }) {
  return <main className="landing-page"><header className="landing-hero"><nav className="landing-nav"><div className="brand"><div className="brand-mark">SA</div><strong>Skunkworks Academy Portal</strong></div><button onClick={() => signIn(selectedRole)}>Sign in with Microsoft</button></nav><div className="landing-copy"><p>Academy operations, learning, and instructor onboarding</p><h1>Skunkworks Academy Portal</h1><span>One Microsoft-connected entry point for students, instructors, and staff.</span></div><div className="landing-stats"><div><strong>{liveJobs}</strong><span>Live instructor roles</span></div><div><strong>3</strong><span>Role workspaces</span></div><div><strong>Teams</strong><span>Enterprise app ready</span></div></div></header><section className="role-entry-grid">{landingRoles.map((item) => <article className={selectedRole === item.role ? "role-entry selected" : "role-entry"} key={item.role}><h2>{item.title}</h2><p>{item.detail}</p><button onClick={() => { selectRole(item.role); signIn(item.role); }}>Continue as {item.role}</button></article>)}</section></main>;
}

function CourseCatalog({ courses }: { courses: CourseRecord[] }) {
  return <section><div className="section-head"><h2>Courses</h2><span className="pill">Student view</span></div><div className="card-grid">{courses.map((course) => <article className="card" key={course.id}><div className="card-title"><h3>{course.title}</h3><span className="pill">{course.level}</span></div><p>{course.description}</p><dl><div><dt>Duration</dt><dd>{course.duration}</dd></div></dl></article>)}</div></section>;
}

function ClassWorkspace({ activeRole, classes, registeredClassIds, registerForClass }: { activeRole: PortalRole; classes: ClassSession[]; registeredClassIds: string[]; registerForClass: (id: string) => void }) {
  const visibleClasses = activeRole === "Student" ? classes.filter((item) => registeredClassIds.includes(item.id)) : classes;
  return <section><div className="section-head"><h2>{activeRole === "Student" ? "My Classes" : "Class Monitoring"}</h2><span className="pill">{visibleClasses.length} classes</span></div><div className="card-grid">{visibleClasses.map((item) => <article className="card compact" key={item.id}><div className="card-title"><h3>{item.title}</h3><span className="pill">{item.status}</span></div><p>{item.schedule} - {item.modality}</p><dl><div><dt>Instructor</dt><dd>{item.instructor || "Pending"}</dd></div><div><dt>Seats</dt><dd>{item.enrolled}/{item.seats}</dd></div></dl>{activeRole === "Student" && !registeredClassIds.includes(item.id) && <button onClick={() => registerForClass(item.id)}>Register</button>}</article>)}</div></section>;
}

function ClassRegistration({ classes, registeredClassIds, registerForClass }: { classes: ClassSession[]; registeredClassIds: string[]; registerForClass: (id: string) => void }) {
  return <section><div className="section-head"><h2>Register for a Class</h2><span className="pill">Available cohorts</span></div><div className="card-grid">{classes.map((item) => <article className="card" key={item.id}><div className="card-title"><h3>{item.title}</h3><span className="pill">{item.status}</span></div><p>{item.schedule}</p><dl><div><dt>Course</dt><dd>{item.courseTitle}</dd></div><div><dt>Seats</dt><dd>{item.enrolled}/{item.seats}</dd></div></dl><button disabled={registeredClassIds.includes(item.id) || item.status === "Full"} onClick={() => registerForClass(item.id)}>{registeredClassIds.includes(item.id) ? "Registered" : item.status === "Full" ? "Full" : "Register"}</button></article>)}</div></section>;
}

function StaffClassScheduling({ courses, classes, registrations, classDraft, setClassDraft, createClass, loading }: { courses: CourseRecord[]; classes: ClassSession[]; registrations: ClassRegistrationRecord[]; classDraft: ClassInput; setClassDraft: (value: ClassInput) => void; createClass: (event: FormEvent<HTMLFormElement>) => Promise<void>; loading: boolean }) {
  function chooseCourse(courseId: string) {
    const course = courses.find((item) => item.id === courseId);
    setClassDraft({ ...classDraft, courseId, courseTitle: course?.title ?? "" });
  }
  return <section className="admin-grid"><div className="form-panel"><h2>Schedule Class</h2><form onSubmit={createClass}><label>Course<select value={classDraft.courseId} onChange={(event) => chooseCourse(event.target.value)} required><option value="">Select course</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label><label>Class title<input value={classDraft.title} onChange={(event) => setClassDraft({ ...classDraft, title: event.target.value })} required /></label><label>Schedule<input value={classDraft.schedule} onChange={(event) => setClassDraft({ ...classDraft, schedule: event.target.value })} required /></label><label>Modality<select value={classDraft.modality} onChange={(event) => setClassDraft({ ...classDraft, modality: event.target.value })}><option>Hybrid</option><option>Remote</option><option>On campus</option></select></label><label>Instructor<input value={classDraft.instructor} onChange={(event) => setClassDraft({ ...classDraft, instructor: event.target.value })} /></label><label>Seats<input type="number" min="1" value={classDraft.seats} onChange={(event) => setClassDraft({ ...classDraft, seats: Number(event.target.value) })} /></label><label>Status<select value={classDraft.status} onChange={(event) => setClassDraft({ ...classDraft, status: event.target.value as ClassInput["status"] })}><option>Scheduled</option><option>Open</option><option>Full</option><option>InProgress</option><option>Complete</option><option>Cancelled</option></select></label><button disabled={loading}>Save class</button></form></div><div><h2>Scheduled Classes</h2><div className="stack">{classes.map((item) => <article className="card compact" key={item.id}><div className="card-title"><h3>{item.title}</h3><span className="pill">{item.status}</span></div><p>{item.courseTitle} - {item.schedule}</p><dl><div><dt>Instructor</dt><dd>{item.instructor || "Pending"}</dd></div><div><dt>Enrollment</dt><dd>{item.enrolled}/{item.seats}</dd></div></dl></article>)}</div><h2>Registrations</h2><ApplicationTable headers={["Class", "Student", "Status", "Registered"]} rows={registrations.map((item) => [item.classTitle, item.studentEmail, item.status, item.registeredAt ? new Date(item.registeredAt).toLocaleDateString() : ""])} /></div></section>;
}

function Jobs({ jobs, savedJobIds, toggleSavedJob, selectJob, activeRole }: { jobs: JobPosting[]; savedJobIds: string[]; toggleSavedJob: (id: string) => void; selectJob: (id: string) => void; activeRole: PortalRole }) {
  return <section><div className="section-head"><h2>{activeRole === "Staff" ? "Job Postings" : "Open Instructor Roles"}</h2><span className="pill">{jobs.length} live</span></div><div className="card-grid">{jobs.map((job) => <article className="card" key={job.id}><div className="card-title"><h3>{job.title}</h3><span className="pill">{job.modality}</span></div><p>{job.description}</p><dl><div><dt>Programme</dt><dd>{job.programme}</dd></div><div><dt>Closing</dt><dd>{job.closingDate || "Open until filled"}</dd></div></dl><div className="button-row"><button onClick={() => selectJob(job.id)}>{activeRole === "Staff" ? "Manage posting" : "Apply"}</button>{activeRole === "Instructor" && <button className="secondary-action" onClick={() => toggleSavedJob(job.id)}>{savedJobIds.includes(job.id) ? "Saved" : "Save"}</button>}</div></article>)}</div></section>;
}

function InstructorApplications(props: { profile: UserProfile; applications: ApplicationRecord[]; displayJobs: JobPosting[]; selectedJobId: string; setSelectedJobId: (id: string) => void; discipline: string; setDiscipline: (value: string) => void; loading: boolean; submitApplication: (event: FormEvent<HTMLFormElement>) => Promise<void>; refresh: () => void }) {
  return <section className="split-panel"><div className="form-panel"><div className="section-head"><h2>Apply for an Instructor Role</h2><button onClick={props.refresh}>Refresh</button></div><form onSubmit={props.submitApplication}><label>Role<select name="jobId" value={props.selectedJobId} onChange={(event) => props.setSelectedJobId(event.target.value)} required>{props.displayJobs.map((job) => <option key={job.id} value={job.id}>{job.title} - {job.programme}</option>)}</select></label><label>Name<input name="applicantName" defaultValue={props.profile.name} required /></label><label>Email<input name="applicantEmail" type="email" defaultValue={props.profile.username} required /></label><label>Phone<input name="phone" autoComplete="tel" required /></label><label>Discipline<input name="discipline" list="discipline-options" value={props.discipline} onChange={(event) => props.setDiscipline(event.target.value)} required /></label><datalist id="discipline-options">{disciplineOptions.map((option) => <option value={option} key={option} />)}</datalist><label>Availability<select name="availability"><option>Weekdays</option><option>Evenings</option><option>Weekends</option><option>Flexible</option></select></label><label className="full">Experience<textarea name="experience" required placeholder="Summarize teaching experience, certifications, and learner groups." /></label><label className="full">CV or certificate<input name="resume" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" /></label><button disabled={props.loading}>{props.loading ? "Working..." : "Submit application"}</button></form></div><ApplicationTable applications={props.applications} /></section>;
}

function StaffApplications({ profile, applications, updateApplication, refresh }: { profile: UserProfile; applications: ApplicationRecord[]; updateApplication: (id: string, status: ApplicationStatus, owner: string) => Promise<void>; refresh: () => void }) {
  if (!profile.isAdmin) return <LockedStaffPanel />;
  return <section><div className="section-head"><h2>Instructor Applications</h2><button onClick={refresh}>Refresh</button></div><div className="stack">{applications.map((item) => <AdminApplicationCard key={item.id} item={item} updateApplication={updateApplication} />)}{applications.length === 0 && <div className="command-panel"><p className="panel-copy">No applications loaded yet.</p></div>}</div></section>;
}

function AdminApplicationCard({ item, updateApplication }: { item: ApplicationRecord; updateApplication: (id: string, status: ApplicationStatus, owner: string) => Promise<void> }) {
  const [status, setStatus] = useState<ApplicationStatus>(item.status);
  const [owner, setOwner] = useState(item.owner);
  return <article className="card compact"><div className="card-title"><h3>{item.applicantName}</h3><span className="pill">{item.status}</span></div><p>{item.jobTitle} - {item.applicantEmail}</p><div className="inline-fields"><select value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus)}><option>Submitted</option><option>Screening</option><option>Interview</option><option>Offer</option><option>Rejected</option></select><input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Owner" /><button onClick={() => updateApplication(item.id, status, owner)}>Update</button></div></article>;
}

function StaffOperations({ profile, jobDraft, setJobDraft, createJob, tasks, advanceTask, loading }: { profile: UserProfile; jobDraft: JobInput; setJobDraft: (value: JobInput) => void; createJob: (event: FormEvent<HTMLFormElement>) => Promise<void>; tasks: OnboardingTask[]; advanceTask: (task: OnboardingTask) => Promise<void>; loading: boolean }) {
  if (!profile.isAdmin) return <LockedStaffPanel />;
  return <section className="admin-grid"><div className="form-panel"><h2>Create Job Posting</h2><form onSubmit={createJob}><label>Title<input value={jobDraft.title} onChange={(event) => setJobDraft({ ...jobDraft, title: event.target.value })} required /></label><label>Programme<input value={jobDraft.programme} onChange={(event) => setJobDraft({ ...jobDraft, programme: event.target.value })} required /></label><label>Modality<select value={jobDraft.modality} onChange={(event) => setJobDraft({ ...jobDraft, modality: event.target.value })}><option>Hybrid</option><option>Remote</option><option>On campus</option></select></label><label>Rate band<input value={jobDraft.rateBand} onChange={(event) => setJobDraft({ ...jobDraft, rateBand: event.target.value })} /></label><label>Closing date<input type="date" value={jobDraft.closingDate} onChange={(event) => setJobDraft({ ...jobDraft, closingDate: event.target.value })} /></label><label>Status<select value={jobDraft.status} onChange={(event) => setJobDraft({ ...jobDraft, status: event.target.value as JobInput["status"] })}><option>Draft</option><option>Live</option><option>Closed</option></select></label><label className="full">Description<textarea value={jobDraft.description} onChange={(event) => setJobDraft({ ...jobDraft, description: event.target.value })} required /></label><button disabled={loading}>Save posting</button></form></div><div><h2>Onboarding Tasks</h2><div className="stack">{tasks.map((task) => <article className="card compact" key={task.id}><div className="card-title"><h3>{task.title}</h3><span className="pill">{task.status}</span></div><p>{task.candidateName} - {task.detail}</p><button onClick={() => advanceTask(task)}>Advance task</button></article>)}{tasks.length === 0 && <div className="command-panel"><p className="panel-copy">No onboarding tasks loaded yet.</p></div>}</div></div></section>;
}

function StaffProfiles({ title, profiles, profile, emptyText }: { title: string; profiles: PortalProfile[]; profile: UserProfile; emptyText: string }) {
  if (!profile.isAdmin) return <LockedStaffPanel />;
  return <section><div className="section-head"><h2>{title}</h2><span className="pill">{profiles.length} profiles</span></div><div className="card-grid">{profiles.map((item) => <article className="card compact" key={item.id}><div className="card-title"><h3>{item.displayName || item.email}</h3><span className="pill">{item.portalRole}</span></div><p>{item.email}</p><dl><div><dt>Phone</dt><dd>{item.phone || "Not set"}</dd></div><div><dt>Location</dt><dd>{item.location || "Not set"}</dd></div><div><dt>CV</dt><dd>{item.cvDocumentUrl ? "Uploaded" : "Not uploaded"}</dd></div><div><dt>Updated</dt><dd>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "Never"}</dd></div></dl></article>)}{profiles.length === 0 && <div className="command-panel"><p className="panel-copy">{emptyText}</p></div>}</div></section>;
}

function StaffSettings({ profile, health, refresh }: { profile: UserProfile; health: PortalHealth | null; refresh: () => void }) {
  if (!profile.isAdmin) return <LockedStaffPanel />;
  return <section className="dashboard-grid"><div className="command-panel"><div className="section-head"><h2>Portal Status</h2><button onClick={refresh}>Refresh</button></div><dl><div><dt>API</dt><dd>{health?.ok ? "Online" : "Checking"}</dd></div><div><dt>Missing settings</dt><dd>{health?.missingSettings.length ? health.missingSettings.join(", ") : "None"}</dd></div><div><dt>Allowed origins</dt><dd>{health?.allowedOrigins.length ?? 0}</dd></div></dl></div><div className="command-panel"><h2>Connected Routes</h2><div className="route-list">{(health?.routes ?? ["GET /api/health"]).map((route) => <span key={route}>{route}</span>)}</div></div></section>;
}

function LockedStaffPanel() {
  return <section className="dashboard-grid"><div className="command-panel"><h2>Staff Access Required</h2><p className="panel-copy">This workflow requires the `Portal.Admin` or staff app role from Microsoft Entra. The development role preview can show the menu, but it cannot grant production permissions.</p></div><div className="command-panel"><h2>Teams Ready Scope</h2><p className="panel-copy">Package this portal as a Teams tab with Microsoft SSO, then expose staff operations inside the enterprise app.</p></div></section>;
}

function Resources({ activeRole }: { activeRole: PortalRole }) {
  return <section><div className="section-head"><h2>{activeRole} Resources</h2><span className="pill">Role-aware</span></div><div className="card-grid">{roleDefinitions[activeRole].resources.map((item) => <article className="card compact" key={item.title}><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div></section>;
}

function ProfileEditor({ activeRole, profile, editableProfile, setEditableProfile, setCvFile, saveProfile }: { activeRole: PortalRole; profile: UserProfile; editableProfile: PortalProfileInput; setEditableProfile: (value: PortalProfileInput) => void; setCvFile: (file: File | null) => void; saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <section className="split-panel"><div className="form-panel"><div className="section-head"><h2>Edit Profile</h2><span className="pill">{activeRole}</span></div><form onSubmit={saveProfile}><label>Display name<input value={editableProfile.displayName || profile.name} onChange={(event) => setEditableProfile({ ...editableProfile, displayName: event.target.value })} /></label><label>Email<input value={profile.username} disabled /></label><label>Phone<input value={editableProfile.phone} onChange={(event) => setEditableProfile({ ...editableProfile, phone: event.target.value })} /></label><label>Location<input value={editableProfile.location} onChange={(event) => setEditableProfile({ ...editableProfile, location: event.target.value })} /></label>{activeRole === "Instructor" && <label className="full">CV or resume<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => { const file = event.target.files?.[0] ?? null; setCvFile(file); setEditableProfile({ ...editableProfile, cvFileName: file?.name ?? editableProfile.cvFileName }); }} /></label>}<label className="full">Profile summary<textarea value={editableProfile.bio} onChange={(event) => setEditableProfile({ ...editableProfile, bio: event.target.value })} /></label><button>Save profile</button></form></div><div className="command-panel"><h2>Account Details</h2><dl><div><dt>Tenant</dt><dd>{profile.tenantId ?? "Not available"}</dd></div><div><dt>Role source</dt><dd>{import.meta.env.DEV ? "Development preview" : "Microsoft Entra"}</dd></div><div><dt>CV</dt><dd>{editableProfile.cvFileName || "Not uploaded"}</dd></div></dl></div></section>;
}

function ApplicationTable({ applications, headers, rows }: { applications?: ApplicationRecord[]; headers?: string[]; rows?: string[][] }) {
  const tableHeaders = headers ?? ["Role", "Status", "Submitted", "Owner"];
  const tableRows = rows ?? (applications ?? []).map((item) => [item.jobTitle, item.status, new Date(item.submittedAt).toLocaleDateString(), item.owner || "Unassigned"]);
  return <div className="table-wrap"><table><thead><tr>{tableHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{tableRows.length ? tableRows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td colSpan={tableHeaders.length}>No records yet.</td></tr>}</tbody></table></div>;
}

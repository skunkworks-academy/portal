import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { loginRequest, skunkworksTenantId } from "./authConfig";
import { portalApi } from "./api";
import {
  canAccess,
  classSchedule,
  courseCatalog,
  hasStaffRole,
  landingRoles,
  roleDefinitions,
  roleFromClaims,
  type Tab
} from "./roles";
import type {
  ApplicationRecord,
  ApplicationStatus,
  ClassInput,
  ClassRegistrationRecord,
  ClassSession,
  CourseRecord,
  JobInput,
  JobPosting,
  NewApplication,
  OnboardingTask,
  PortalHealth,
  PortalProfile,
  PortalProfileInput,
  PortalRole,
  UserProfile
} from "./types";

const BRAND_ICON_BLACK = "https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-black.png";
const BRAND_ICON_WHITE = "https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-white.png";
const HOME_URL = "https://skunkworksacademy.com/";
const PORTAL_URL = "https://portal.skunkworksacademy.com/";

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

const fallbackCourses: CourseRecord[] = courseCatalog.map((course) => ({ ...course, status: "Live" }));

const fallbackClasses: ClassSession[] = classSchedule.map((item) => ({
  ...item,
  courseTitle: courseCatalog.find((course) => course.id === item.courseId)?.title ?? item.title,
  modality: "Hybrid",
  enrolled: 0,
  status: "Open"
}));

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

const setupSteps = [
  "Microsoft sign-in configured",
  "Azure Functions API deployed",
  "SharePoint site connected",
  "Admin roles assigned",
  "Teams app package prepared"
];

const publicNav = [
  { id: "home", label: "Home" },
  { id: "workspaces", label: "Workspaces" },
  { id: "courses", label: "Courses" },
  { id: "jobs", label: "Instructor Jobs" },
  { id: "resources", label: "Resources" },
  { id: "sitemap", label: "Site Map" },
  { id: "support", label: "Support" }
] as const;

const globalNav = [
  { label: "Home", href: HOME_URL },
  { label: "Self-paced", href: "https://skunkworksacademy.com/self-paced/" },
  { label: "Portal", href: PORTAL_URL },
  { label: "Labs", href: "https://labs.skunkworksacademy.com/" },
  { label: "Plans", href: "https://skunkworksacademy.com/subscriptions/#pricing" },
  { label: "Purchase", href: "https://skunkworksacademy.com/subscriptions/#purchasing" }
] as const;

const portalMap = [
  {
    title: "Public portal",
    detail: "Signed-out landing page, role selection, public job discovery, course overview, resources, support, terms, and privacy.",
    links: ["Home", "Workspaces", "Courses", "Instructor Jobs", "Resources", "Site Map", "Support"]
  },
  {
    title: "Student workspace",
    detail: "Student-only view for course discovery, cohort registration, enrolled classes, resources, and profile management.",
    links: roleDefinitions.Student.nav.map((item) => item.label)
  },
  {
    title: "Instructor workspace",
    detail: "Instructor view for open roles, applications, assigned classes, profile, CV upload, and instructor resources.",
    links: roleDefinitions.Instructor.nav.map((item) => item.label)
  },
  {
    title: "Staff operations",
    detail: "Operational workspace for job postings, applications, instructor onboarding, students, scheduling, resources, and settings.",
    links: roleDefinitions.Staff.nav.map((item) => item.label)
  },
  {
    title: "Connected ecosystem",
    detail: "Consistent links back into the Skunkworks Academy ecosystem and supporting Microsoft-connected surfaces.",
    links: ["Academy Home", "Forms", "Labs", "Teams App", "GitHub Repository"]
  }
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

const emptyClass: ClassInput = {
  courseId: "",
  courseTitle: "",
  title: "",
  schedule: "",
  modality: "Hybrid",
  instructor: "",
  seats: 20,
  status: "Open"
};

function emptyPortalProfile(role: PortalRole, profile?: UserProfile | null): PortalProfileInput {
  return {
    displayName: profile?.name ?? "",
    portalRole: role,
    phone: "",
    location: "",
    bio: "",
    cvFileName: ""
  };
}

function roleBadge(profile: UserProfile, activeRole: PortalRole) {
  if (!profile.isAdmin) return activeRole;
  const normalizedRoles = profile.roles.map((role) => role.toLowerCase());
  return normalizedRoles.includes("portal.admin") ? "Portal.Admin" : "Portal.Staff";
}

function getProfile(account?: AccountInfo | null): UserProfile | null {
  if (!account) return null;
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;
  const roles = Array.isArray(claims?.roles) ? (claims.roles as string[]) : [];
  const tenantId = typeof claims?.tid === "string" ? claims.tid : account.tenantId;
  const isAdmin = tenantId === skunkworksTenantId && hasStaffRole(roles);
  return {
    name: account.name ?? account.username,
    username: account.username,
    tenantId,
    roles,
    isAdmin,
    portalRole: roleFromClaims(roles, isAdmin)
  };
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    return stored === "Student" || stored === "Instructor" || stored === "Staff" ? stored : "Student";
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
  const [adminJobs, setAdminJobs] = useState<JobPosting[]>([]);
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
    try {
      nextJobs = await portalApi.jobs();
    } catch {
      nextJobs = fallbackJobs;
    }
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
    const [nextApplications, nextTasks, nextProfiles, nextRegistrations, nextJobs] = await Promise.all([
      portalApi.adminApplications(auth),
      portalApi.adminTasks(auth),
      portalApi.adminProfiles(auth),
      portalApi.adminClassRegistrations(auth),
      portalApi.adminJobs(auth)
    ]);
    setAdminApplications(nextApplications);
    setTasks(nextTasks);
    setAdminProfiles(nextProfiles);
    setAllClassRegistrations(nextRegistrations);
    setAdminJobs(nextJobs);
  }

  async function refreshProfile() {
    if (!auth || !profile) return;
    const saved = await portalApi.myProfile(auth);
    setEditableProfile(
      saved
        ? {
            displayName: saved.displayName || profile.name,
            portalRole: saved.portalRole,
            phone: saved.phone,
            location: saved.location,
            bio: saved.bio,
            cvFileName: saved.cvFileName
          }
        : emptyPortalProfile(activeRole, profile)
    );
  }

  function friendlyError(err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    if (message.includes("404")) return "The portal API endpoint was not found. Confirm the Azure Functions deployment and route indexing.";
    if (message.includes("Missing required setting")) return "The portal API is online but missing a required Azure Function App setting. Check /api/health.";
    if (message.includes("SharePoint list") || message.includes("SharePoint library")) {
      return "SharePoint is connected, but the required portal list or library is missing. Run provisioning.";
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
    void run(async () => {
      await Promise.all([refreshJobs(), refreshAcademicData()]);
    });
    portalApi.health().then(setHealth).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!canAccess(activeRole, tab, Boolean(profile?.isAdmin))) setTab("dashboard");
  }, [activeRole, profile?.isAdmin, tab]);

  useEffect(() => {
    if (account) void run(refreshProfile);
  }, [account?.homeAccountId]);

  useEffect(() => {
    if (account && activeRole === "Student") void run(refreshStudentData);
  }, [account?.homeAccountId, activeRole]);

  useEffect(() => {
    if (account && activeRole === "Instructor" && tab === "applications") void run(refreshUserData);
  }, [account?.homeAccountId, activeRole, tab]);

  useEffect(() => {
    if (profile?.isAdmin && ["staff", "jobs", "applications", "instructors", "students", "classes"].includes(tab)) {
      void run(refreshAdminData);
    }
  }, [profile?.isAdmin, account?.homeAccountId, tab]);

  async function signIn(nextRole?: PortalRole) {
    if (nextRole) changeRole(nextRole);
    await instance.loginRedirect(loginRequest);
  }

  async function signOut() {
    await instance.logoutRedirect();
  }

  function openTab(nextTab: Tab) {
    if (canAccess(activeRole, nextTab, Boolean(profile?.isAdmin))) setTab(nextTab);
    setMenuOpen(false);
  }

  function changeRole(role: PortalRole) {
    localStorage.setItem("portalRoleOverride", role);
    setRoleOverride(role);
    setEditableProfile((current) => ({ ...current, portalRole: role }));
    setTab("dashboard");
  }

  function toggleSavedJob(jobId: string) {
    setSavedJobIds((current) => (current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]));
  }

  async function registerClass(classId: string) {
    if (!auth) {
      await signIn("Student");
      return;
    }
    await run(async () => {
      await portalApi.registerClass(classId, auth);
      await Promise.all([refreshAcademicData(), refreshStudentData()]);
    }, "Class registration saved.");
  }

  async function assignInstructor(classId: string) {
    if (!auth) {
      await signIn("Instructor");
      return;
    }
    await run(async () => {
      await portalApi.assignInstructor(classId, auth);
      await refreshAcademicData();
    }, "Class assigned to your instructor profile.");
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) {
      await signIn("Instructor");
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
    if (!auth || !profile?.isAdmin) return;
    await run(async () => {
      await portalApi.createJob(jobDraft, auth);
      setJobDraft(emptyJob);
      await Promise.all([refreshJobs(), refreshAdminData()]);
    }, "Job posting saved.");
  }

  async function updateJob(id: string, payload: Partial<JobInput>) {
    if (!auth || !profile?.isAdmin) return;
    await run(async () => {
      await portalApi.updateJob(id, payload, auth);
      await Promise.all([refreshJobs(), refreshAdminData()]);
    }, "Job posting updated.");
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !profile?.isAdmin) return;
    await run(async () => {
      await portalApi.createClass(classDraft, auth);
      setClassDraft(emptyClass);
      await refreshAcademicData();
    }, "Class scheduled.");
  }

  async function updateClass(id: string, payload: Partial<ClassInput>) {
    if (!auth || !profile?.isAdmin) return;
    await run(async () => {
      await portalApi.updateClass(id, payload, auth);
      await Promise.all([refreshAcademicData(), refreshAdminData()]);
    }, "Class updated.");
  }

  async function updateApplication(id: string, status: ApplicationStatus, owner: string) {
    if (!auth || !profile?.isAdmin) return;
    await run(async () => {
      await portalApi.updateApplication(id, { status, owner }, auth);
      await refreshAdminData();
    }, "Application updated.");
  }

  async function advanceTask(task: OnboardingTask) {
    if (!auth || !profile?.isAdmin) return;
    const nextStatus = task.status === "Due" ? "InProgress" : task.status === "InProgress" ? "Ready" : "Complete";
    await run(async () => {
      await portalApi.updateTask(task.id, { status: nextStatus }, auth);
      await refreshAdminData();
    }, "Task updated.");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    await run(async () => {
      const saved = await portalApi.updateProfile(
        {
          ...editableProfile,
          portalRole: activeRole,
          cvFileName: cvFile?.name || editableProfile.cvFileName,
          cvBase64: cvFile ? await readFileAsBase64(cvFile) : undefined
        },
        auth
      );
      setEditableProfile({
        displayName: saved.displayName,
        portalRole: saved.portalRole,
        phone: saved.phone,
        location: saved.location,
        bio: saved.bio,
        cvFileName: saved.cvFileName
      });
      setCvFile(null);
    }, "Profile updated.");
  }

  const liveJobs = jobs.filter((job) => job.status === "Live");
  const displayJobs = liveJobs.length ? liveJobs : fallbackJobs;
  const staffJobs = adminJobs.length ? adminJobs : displayJobs;
  const selectedJob = displayJobs.find((job) => job.id === selectedJobId) ?? displayJobs[0];
  const setupComplete = health ? Math.max(0, setupSteps.length - health.missingSettings.length) : 2;
  const registeredClassIds = classRegistrations.filter((item) => item.status !== "Cancelled").map((item) => item.classId);
  const enrolledClasses = classes.filter((item) => registeredClassIds.includes(item.id));
  const pipelineCount = profile?.isAdmin ? adminApplications.length : applications.length;
  const instructorProfiles = adminProfiles.filter((item) => item.portalRole === "Instructor");
  const studentProfiles = adminProfiles.filter((item) => item.portalRole === "Student");

  if (!profile) {
    return (
      <LandingPage
        selectedRole={roleOverride}
        liveJobs={displayJobs.length}
        jobs={displayJobs}
        courses={courses}
        classes={classes}
        selectRole={changeRole}
        signIn={signIn}
      />
    );
  }

  return (
    <div className="portal-authenticated">
      <GlobalHeader isAuthenticated userName={profile.name} signOut={signOut} />
      <div className="app-shell">
        <aside className="sidebar">
        <Brand eyebrow="Academy Portal" />
        <button className="menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
          Menu
        </button>
        <nav className={menuOpen ? "open" : ""} aria-label={`${activeRole} workspace navigation`}>
          {roleContent.nav.map((item) => (
            <button type="button" className={tab === item.tab ? "active" : ""} onClick={() => openTab(item.tab)} key={item.tab}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="identity">
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.username}</span>
            <em>{roleBadge(profile, activeRole)}</em>
          </div>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main>
        <section className="hero">
          <div>
            <p>{activeRole} workspace</p>
            <h1>{roleContent.headline}</h1>
            <span className="hero-copy">{roleContent.summary}</span>
          </div>
          <div className="hero-metrics" aria-label="Workspace metrics">
            <div>
              <span>Courses</span>
              <strong>{courses.length}</strong>
            </div>
            <div>
              <span>{activeRole === "Student" ? "My classes" : "Pipeline"}</span>
              <strong>{activeRole === "Student" ? enrolledClasses.length : pipelineCount}</strong>
            </div>
            <div>
              <span>{activeRole === "Instructor" ? "Saved jobs" : "Profiles"}</span>
              <strong>{activeRole === "Instructor" ? savedJobIds.length : activeRole === "Staff" ? adminProfiles.length : liveJobs.length}</strong>
            </div>
          </div>
        </section>

        {(notice || error) && <div className={error ? "alert error" : "alert"}>{error || notice}</div>}
        {health && health.missingSettings.length > 0 && <div className="alert warning">API setup is almost complete. Missing Azure setting: {health.missingSettings.join(", ")}.</div>}

        {tab === "dashboard" && <Dashboard activeRole={activeRole} setupComplete={setupComplete} changeRole={changeRole} />}
        {tab === "courses" && <CourseCatalog courses={courses} />}
        {tab === "classes" && activeRole === "Staff" && (
          <StaffClassScheduling
            courses={courses}
            classes={classes}
            registrations={allClassRegistrations}
            classDraft={classDraft}
            setClassDraft={setClassDraft}
            createClass={createClass}
            updateClass={updateClass}
            loading={loading}
          />
        )}
        {tab === "classes" && activeRole !== "Staff" && (
          <ClassWorkspace
            activeRole={activeRole}
            profile={profile}
            classes={classes}
            registeredClassIds={registeredClassIds}
            registerForClass={registerClass}
            assignInstructor={assignInstructor}
            loading={loading}
          />
        )}
        {tab === "register" && <ClassRegistration classes={classes} registeredClassIds={registeredClassIds} registerForClass={registerClass} />}
        {tab === "jobs" && (
          <Jobs
            jobs={activeRole === "Staff" ? staffJobs : displayJobs}
            savedJobIds={savedJobIds}
            toggleSavedJob={toggleSavedJob}
            selectJob={(id) => {
              setSelectedJobId(id);
              openTab(activeRole === "Staff" ? "staff" : "applications");
            }}
            activeRole={activeRole}
          />
        )}
        {tab === "applications" && activeRole === "Instructor" && (
          <InstructorApplications
            profile={profile}
            applications={applications}
            displayJobs={displayJobs}
            selectedJobId={selectedJob.id}
            setSelectedJobId={setSelectedJobId}
            discipline={discipline}
            setDiscipline={setDiscipline}
            loading={loading}
            submitApplication={submitApplication}
            refresh={() => void run(refreshUserData)}
          />
        )}
        {tab === "applications" && activeRole === "Staff" && (
          <StaffApplications applications={adminApplications} loading={loading} updateApplication={updateApplication} refresh={() => void run(refreshAdminData)} />
        )}
        {tab === "staff" && (
          <StaffOperations
            jobs={staffJobs}
            jobDraft={jobDraft}
            setJobDraft={setJobDraft}
            createJob={createJob}
            updateJob={updateJob}
            applications={adminApplications}
            tasks={tasks}
            advanceTask={advanceTask}
            loading={loading}
            refresh={() => void run(refreshAdminData)}
          />
        )}
        {tab === "instructors" && <ProfileDirectory title="Instructors" profiles={instructorProfiles} />}
        {tab === "students" && <ProfileDirectory title="Students" profiles={studentProfiles} />}
        {tab === "settings" && (
          <Settings
            health={health}
            setupComplete={setupComplete}
            refresh={() =>
              void run(async () => {
                setHealth(await portalApi.health());
              }, "Portal status refreshed.")
            }
          />
        )}
        {tab === "resources" && <Resources activeRole={activeRole} />}
        {tab === "profile" && (
          <ProfileForm
            profile={profile}
            activeRole={activeRole}
            editableProfile={editableProfile}
            setEditableProfile={setEditableProfile}
            setCvFile={setCvFile}
            saveProfile={saveProfile}
            loading={loading}
          />
        )}

        <footer className="legal-footer">
          <a href="/termsofservice" rel="noreferrer">Terms of Service</a>
          <a href="/privacystatement" rel="noreferrer">Privacy Statement</a>
          <a href={HOME_URL} rel="noreferrer">Skunkworks Academy</a>
        </footer>
      </main>
      </div>
    </div>
  );
}

function Brand({ eyebrow = "Portal" }: { eyebrow?: string }) {
  return (
    <a className="brand" href={HOME_URL} aria-label="Skunkworks Academy home">
      <img className="brand-logo logo-light" src={BRAND_ICON_BLACK} alt="" />
      <img className="brand-logo logo-dark" src={BRAND_ICON_WHITE} alt="" />
      <span>
        Skunkworks Academy <span className="brand-section">{eyebrow}</span>
      </span>
    </a>
  );
}

function GlobalHeader({
  signIn,
  selectedRole,
  isAuthenticated = false,
  userName,
  signOut
}: {
  signIn?: (role?: PortalRole) => Promise<void>;
  selectedRole?: PortalRole;
  isAuthenticated?: boolean;
  userName?: string;
  signOut?: () => Promise<void>;
}) {
  return (
    <header className="top" data-fallback-header="true">
      <div className="shell nav">
        <Brand eyebrow="Portal" />
        <nav className="links" aria-label="Primary portal navigation">
          {globalNav.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
          {!isAuthenticated && signIn && (
            <button className="nav-action microsoft-signin" type="button" onClick={() => void signIn(selectedRole)}>
              Sign in with Microsoft
            </button>
          )}
          {isAuthenticated && userName && <span className="nav-user">{userName}</span>}
          {isAuthenticated && signOut && (
            <button className="nav-action" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function LandingPage({
  signIn,
  selectRole,
  selectedRole,
  liveJobs,
  jobs,
  courses,
  classes
}: {
  signIn: (role?: PortalRole) => Promise<void>;
  selectRole: (role: PortalRole) => void;
  selectedRole: PortalRole;
  liveJobs: number;
  jobs: JobPosting[];
  courses: CourseRecord[];
  classes: ClassSession[];
}) {
  const [navOpen, setNavOpen] = useState(false);

  function handleNav(id: string) {
    setNavOpen(false);
    scrollToSection(id);
  }

  return (
    <div className="landing-page" id="home">
      <GlobalHeader signIn={signIn} selectedRole={selectedRole} />

      <section className="landing-hero portal-hero">
        <div className="landing-copy">
          <p>Academy operations, learning, and instructor onboarding</p>
          <h1>Skunkworks Academy Portal</h1>
          <span>One Microsoft-connected entry point for students, instructors, and staff.</span>
          <div className="landing-actions">
            <button className="primary-action large" type="button" onClick={() => void signIn(selectedRole)}>
              Sign in with Microsoft
            </button>
            <button className="ghost-action large" type="button" onClick={() => handleNav("workspaces")}>
              View portal map
            </button>
          </div>
        </div>
        <div className="landing-stats" aria-label="Portal status summary">
          <div>
            <strong>{liveJobs}</strong>
            <span>Live instructor roles</span>
          </div>
          <div>
            <strong>3</strong>
            <span>Role workspaces</span>
          </div>
          <div>
            <strong>Teams</strong>
            <span>Enterprise app ready</span>
          </div>
        </div>
      </section>

      <section className="role-entry-grid" id="workspaces" aria-labelledby="workspaces-title">
        <div className="landing-section-head">
          <p>Role-based entry</p>
          <h2 id="workspaces-title">Choose your workspace</h2>
          <span>Every entry card is clickable and starts the correct Microsoft sign-in context for the selected workspace.</span>
        </div>
        {landingRoles.map((item) => (
          <article className={`role-entry ${selectedRole === item.role ? "selected" : ""}`} key={item.role}>
            <button className="card-hitbox" type="button" onClick={() => selectRole(item.role)} aria-label={`Select ${item.role} workspace`} />
            <div>
              <span className="pill">{item.role}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </div>
            <button type="button" onClick={() => void signIn(item.role)}>
              Continue as {item.role}
            </button>
          </article>
        ))}
      </section>

      <section className="landing-content" id="courses" aria-labelledby="courses-title">
        <div className="landing-section-head">
          <p>Course discovery</p>
          <h2 id="courses-title">Live course catalogue</h2>
          <span>Public catalogue preview with fallback data when SharePoint-backed lists are still being provisioned.</span>
        </div>
        <CourseCatalog courses={courses} />
      </section>

      <section className="landing-content" id="jobs" aria-labelledby="jobs-title">
        <div className="landing-section-head">
          <p>Instructor opportunities</p>
          <h2 id="jobs-title">Open instructor roles</h2>
          <span>Applicants can review roles, select a discipline, and continue into the Microsoft-authenticated application workflow.</span>
        </div>
        <Jobs jobs={jobs} savedJobIds={[]} toggleSavedJob={() => undefined} selectJob={() => void signIn("Instructor")} activeRole="Instructor" />
      </section>

      <section className="landing-content" id="resources" aria-labelledby="resources-title">
        <div className="landing-section-head">
          <p>Resource routing</p>
          <h2 id="resources-title">Role-aware resources</h2>
          <span>Students, instructors, and staff land on different resource sets once signed in.</span>
        </div>
        <div className="link-grid">
          <a href={HOME_URL}>Academy Home</a>
          <a href="https://skunkworksacademy.com/forms/">Forms and intake</a>
          <a href="https://labs.skunkworksacademy.com/">Virtual labs</a>
          <a href="https://jobs.skunkworksacademy.com/">Jobs directory</a>
          <a href="https://github.com/skunkworks-academy/portal">GitHub repository</a>
          <a href="https://teams.microsoft.com/">Microsoft Teams</a>
        </div>
      </section>

      <SiteMapSection />

      <section className="landing-content compact-section" id="support" aria-labelledby="support-title">
        <div className="support-panel card">
          <div>
            <p>Support</p>
            <h2 id="support-title">Need portal access or role changes?</h2>
            <span>Staff can assign Microsoft Entra app roles and confirm SharePoint provisioning before users enter production workflows.</span>
          </div>
          <div className="support-actions">
            <a href="mailto:training@skunkworksacademy.com">training@skunkworksacademy.com</a>
            <a href="https://portal.skunkworksacademy.com/termsofservice">Terms of Service</a>
            <a href="https://portal.skunkworksacademy.com/privacystatement">Privacy Statement</a>
          </div>
        </div>
      </section>
    </div>
  );
}

function Dashboard({ activeRole, setupComplete, changeRole }: { activeRole: PortalRole; setupComplete: number; changeRole: (role: PortalRole) => void }) {
  const roleContent = roleDefinitions[activeRole];
  return (
    <section className="dashboard-grid">
      <div className="command-panel">
        <div className="section-head">
          <h2>Role Access</h2>
          <span className="pill">{activeRole}</span>
        </div>
        <div className="timeline">
          {roleContent.capabilities.map((item) => (
            <div key={item}>
              <strong>{item}</strong>
              <span>Available in the {activeRole.toLowerCase()} workspace.</span>
            </div>
          ))}
        </div>
      </div>
      <div className="command-panel">
        <div className="section-head">
          <h2>Setup Status</h2>
          <span className="pill">{setupComplete}/{setupSteps.length}</span>
        </div>
        <div className="setup-list">
          {setupSteps.map((step, index) => (
            <div className={index < setupComplete ? "complete" : ""} key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="command-panel wide">
        <SiteMapSection compact />
      </div>
      {import.meta.env.DEV && (
        <div className="command-panel wide">
          <div className="section-head">
            <h2>Development Role Preview</h2>
            <span className="pill">Not production auth</span>
          </div>
          <div className="role-switcher">
            {(["Student", "Instructor", "Staff"] as PortalRole[]).map((role) => (
              <button className={activeRole === role ? "selected" : ""} type="button" onClick={() => changeRole(role)} key={role}>
                {role}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SiteMapSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "landing-content compact-section" : "landing-content"} id="sitemap" aria-labelledby="sitemap-title">
      <div className="landing-section-head">
        <p>Wire map</p>
        <h2 id="sitemap-title">Portal page and navigation map</h2>
        <span>How the public entry page, role workspaces, and ecosystem links fit together.</span>
      </div>
      <div className="site-map-grid">
        {portalMap.map((item) => (
          <article className="map-card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <div className="map-links">
              {item.links.map((link) => (
                <span key={link}>{link}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CourseCatalog({ courses }: { courses: CourseRecord[] }) {
  return (
    <section>
      <div className="section-head">
        <h2>Courses</h2>
        <span className="pill">{courses.length} active</span>
      </div>
      <div className="card-grid">
        {courses.map((course) => (
          <article className="card" key={course.id}>
            <div className="card-title">
              <h3>{course.title}</h3>
              <span className="pill">{course.level}</span>
            </div>
            <p>{course.description}</p>
            <dl>
              <div>
                <dt>Duration</dt>
                <dd>{course.duration}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{course.status}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ClassWorkspace({
  activeRole,
  profile,
  classes,
  registeredClassIds,
  registerForClass,
  assignInstructor,
  loading
}: {
  activeRole: PortalRole;
  profile: UserProfile;
  classes: ClassSession[];
  registeredClassIds: string[];
  registerForClass: (id: string) => void;
  assignInstructor: (id: string) => void;
  loading: boolean;
}) {
  const visibleClasses = activeRole === "Student" ? classes.filter((item) => registeredClassIds.includes(item.id)) : classes;
  return (
    <section>
      <div className="section-head">
        <h2>{activeRole === "Student" ? "My Classes" : "Class Monitoring"}</h2>
        <span className="pill">{visibleClasses.length} classes</span>
      </div>
      <div className="card-grid">
        {visibleClasses.map((item) => {
          const instructor = item.instructor.trim();
          const normalizedInstructor = instructor.toLowerCase();
          const isPendingInstructor = !instructor || normalizedInstructor === "pending" || normalizedInstructor === "pending assignment";
          const assignedToMe = Boolean(instructor) && [profile.name, profile.username].some((value) => value.toLowerCase() === normalizedInstructor);
          return (
            <article className="card compact" key={item.id}>
              <div className="card-title">
                <h3>{item.title}</h3>
                <span className="pill">{item.status}</span>
              </div>
              <p>{item.schedule} - {item.modality}</p>
              <dl>
                <div>
                  <dt>Instructor</dt>
                  <dd>{instructor || "Pending"}</dd>
                </div>
                <div>
                  <dt>Seats</dt>
                  <dd>{item.enrolled}/{item.seats}</dd>
                </div>
              </dl>
              {activeRole === "Student" && !registeredClassIds.includes(item.id) && (
                <button type="button" onClick={() => registerForClass(item.id)}>
                  Register
                </button>
              )}
              {activeRole === "Instructor" && isPendingInstructor && (
                <button disabled={loading} type="button" onClick={() => assignInstructor(item.id)}>
                  Assign me
                </button>
              )}
              {activeRole === "Instructor" && assignedToMe && <span className="pill success">Assigned to you</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ClassRegistration({ classes, registeredClassIds, registerForClass }: { classes: ClassSession[]; registeredClassIds: string[]; registerForClass: (id: string) => void }) {
  return (
    <section>
      <div className="section-head">
        <h2>Register for a Class</h2>
        <span className="pill">Available cohorts</span>
      </div>
      <div className="card-grid">
        {classes.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-title">
              <h3>{item.title}</h3>
              <span className="pill">{item.status}</span>
            </div>
            <p>{item.schedule}</p>
            <dl>
              <div>
                <dt>Course</dt>
                <dd>{item.courseTitle}</dd>
              </div>
              <div>
                <dt>Seats</dt>
                <dd>{item.enrolled}/{item.seats}</dd>
              </div>
            </dl>
            <button disabled={registeredClassIds.includes(item.id) || item.status === "Full"} type="button" onClick={() => registerForClass(item.id)}>
              {registeredClassIds.includes(item.id) ? "Registered" : item.status === "Full" ? "Full" : "Register"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StaffClassScheduling({
  courses,
  classes,
  registrations,
  classDraft,
  setClassDraft,
  createClass,
  updateClass,
  loading
}: {
  courses: CourseRecord[];
  classes: ClassSession[];
  registrations: ClassRegistrationRecord[];
  classDraft: ClassInput;
  setClassDraft: (value: ClassInput) => void;
  createClass: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateClass: (id: string, payload: Partial<ClassInput>) => Promise<void>;
  loading: boolean;
}) {
  function chooseCourse(courseId: string) {
    const course = courses.find((item) => item.id === courseId);
    setClassDraft({ ...classDraft, courseId, courseTitle: course?.title ?? "" });
  }

  return (
    <section className="admin-grid">
      <div className="form-panel">
        <h2>Schedule Class</h2>
        <form onSubmit={createClass}>
          <label>
            Course
            <select value={classDraft.courseId} onChange={(event) => chooseCourse(event.target.value)} required>
              <option value="">Select course</option>
              {courses.map((course) => (
                <option value={course.id} key={course.id}>{course.title}</option>
              ))}
            </select>
          </label>
          <label>
            Class title
            <input value={classDraft.title} onChange={(event) => setClassDraft({ ...classDraft, title: event.target.value })} required />
          </label>
          <label>
            Schedule
            <input value={classDraft.schedule} onChange={(event) => setClassDraft({ ...classDraft, schedule: event.target.value })} required />
          </label>
          <label>
            Modality
            <select value={classDraft.modality} onChange={(event) => setClassDraft({ ...classDraft, modality: event.target.value })}>
              <option>Hybrid</option>
              <option>Remote</option>
              <option>On campus</option>
            </select>
          </label>
          <label>
            Instructor
            <input value={classDraft.instructor} onChange={(event) => setClassDraft({ ...classDraft, instructor: event.target.value })} />
          </label>
          <label>
            Seats
            <input type="number" min="1" value={classDraft.seats} onChange={(event) => setClassDraft({ ...classDraft, seats: Number(event.target.value) })} />
          </label>
          <label>
            Status
            <select value={classDraft.status} onChange={(event) => setClassDraft({ ...classDraft, status: event.target.value as ClassInput["status"] })}>
              <option>Scheduled</option>
              <option>Open</option>
              <option>Full</option>
              <option>InProgress</option>
              <option>Complete</option>
              <option>Cancelled</option>
            </select>
          </label>
          <button disabled={loading}>Save class</button>
        </form>
      </div>
      <div className="stack">
        <div className="section-head">
          <h2>Scheduled Classes</h2>
          <span className="pill">{classes.length}</span>
        </div>
        {classes.map((item) => (
          <ClassEditorCard item={item} updateClass={updateClass} loading={loading} key={item.id} />
        ))}
        <div className="section-head">
          <h2>Registrations</h2>
          <span className="pill">{registrations.length}</span>
        </div>
        <DataTable headers={["Class", "Student", "Status", "Registered"]} rows={registrations.map((item) => [item.classTitle, item.studentEmail, item.status, item.registeredAt ? new Date(item.registeredAt).toLocaleDateString() : ""])} />
      </div>
    </section>
  );
}

function ClassEditorCard({ item, updateClass, loading }: { item: ClassSession; updateClass: (id: string, payload: Partial<ClassInput>) => Promise<void>; loading: boolean }) {
  const [draft, setDraft] = useState<ClassInput>({
    courseId: item.courseId,
    courseTitle: item.courseTitle,
    title: item.title,
    schedule: item.schedule,
    modality: item.modality,
    instructor: item.instructor,
    seats: item.seats,
    status: item.status
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateClass(item.id, draft);
  }

  return (
    <article className="card compact">
      <form className="inline-edit" onSubmit={submit}>
        <label>
          Title
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          Schedule
          <input value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} />
        </label>
        <label>
          Instructor
          <input value={draft.instructor} onChange={(event) => setDraft({ ...draft, instructor: event.target.value })} />
        </label>
        <label>
          Status
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ClassInput["status"] })}>
            <option>Scheduled</option>
            <option>Open</option>
            <option>Full</option>
            <option>InProgress</option>
            <option>Complete</option>
            <option>Cancelled</option>
          </select>
        </label>
        <label>
          Seats
          <input type="number" min="1" value={draft.seats} onChange={(event) => setDraft({ ...draft, seats: Number(event.target.value) })} />
        </label>
        <button disabled={loading}>Update class</button>
      </form>
    </article>
  );
}

function Jobs({
  jobs,
  savedJobIds,
  toggleSavedJob,
  selectJob,
  activeRole
}: {
  jobs: JobPosting[];
  savedJobIds: string[];
  toggleSavedJob: (id: string) => void;
  selectJob: (id: string) => void;
  activeRole: PortalRole;
}) {
  return (
    <section>
      <div className="section-head">
        <h2>Instructor Jobs</h2>
        <span className="pill">{jobs.length} roles</span>
      </div>
      <div className="card-grid">
        {jobs.map((job) => (
          <article className="card" key={job.id}>
            <div className="card-title">
              <h3>{job.title}</h3>
              <span className="pill">{job.status}</span>
            </div>
            <p>{job.description}</p>
            <dl>
              <div>
                <dt>Programme</dt>
                <dd>{job.programme}</dd>
              </div>
              <div>
                <dt>Modality</dt>
                <dd>{job.modality}</dd>
              </div>
              <div>
                <dt>Rate band</dt>
                <dd>{job.rateBand || "TBC"}</dd>
              </div>
              <div>
                <dt>Applicants</dt>
                <dd>{job.applicants}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button type="button" onClick={() => selectJob(job.id)}>{activeRole === "Staff" ? "Manage" : "Apply"}</button>
              {activeRole === "Instructor" && (
                <button className="secondary-action" type="button" onClick={() => toggleSavedJob(job.id)}>
                  {savedJobIds.includes(job.id) ? "Saved" : "Save"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function InstructorApplications({
  profile,
  applications,
  displayJobs,
  selectedJobId,
  setSelectedJobId,
  discipline,
  setDiscipline,
  loading,
  submitApplication,
  refresh
}: {
  profile: UserProfile;
  applications: ApplicationRecord[];
  displayJobs: JobPosting[];
  selectedJobId: string;
  setSelectedJobId: (id: string) => void;
  discipline: string;
  setDiscipline: (value: string) => void;
  loading: boolean;
  submitApplication: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  refresh: () => void;
}) {
  return (
    <section className="split-panel">
      <div className="form-panel">
        <div className="section-head">
          <h2>Apply for Instructor Work</h2>
          <button type="button" className="secondary-action" onClick={refresh}>Refresh</button>
        </div>
        <form onSubmit={submitApplication}>
          <label>
            Job
            <select name="jobId" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} required>
              {displayJobs.map((job) => (
                <option value={job.id} key={job.id}>{job.title}</option>
              ))}
            </select>
          </label>
          <label>
            Full name
            <input name="applicantName" defaultValue={profile.name} required />
          </label>
          <label>
            Email
            <input name="applicantEmail" type="email" defaultValue={profile.username} required />
          </label>
          <label>
            Phone
            <input name="phone" required />
          </label>
          <label>
            Discipline
            <select name="discipline" value={discipline} onChange={(event) => setDiscipline(event.target.value)} required>
              <option value="">Select discipline</option>
              {disciplineOptions.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Availability
            <input name="availability" placeholder="Weekdays, evenings, remote, onsite" required />
          </label>
          <label className="full">
            Experience
            <textarea name="experience" placeholder="Summarise vendor certifications, courses taught, industry projects, and lab experience." required />
          </label>
          <label className="full">
            Resume or CV
            <input name="resume" type="file" accept=".pdf,.doc,.docx" />
          </label>
          <button disabled={loading}>Submit application</button>
        </form>
      </div>
      <div className="stack">
        <div className="section-head">
          <h2>My Applications</h2>
          <span className="pill">{applications.length}</span>
        </div>
        <DataTable headers={["Job", "Status", "Owner", "Submitted"]} rows={applications.map((item) => [item.jobTitle, item.status, item.owner, item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : ""])} empty="No applications yet." />
      </div>
    </section>
  );
}

function StaffOperations({
  jobs,
  jobDraft,
  setJobDraft,
  createJob,
  updateJob,
  applications,
  tasks,
  advanceTask,
  loading,
  refresh
}: {
  jobs: JobPosting[];
  jobDraft: JobInput;
  setJobDraft: (value: JobInput) => void;
  createJob: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateJob: (id: string, payload: Partial<JobInput>) => Promise<void>;
  applications: ApplicationRecord[];
  tasks: OnboardingTask[];
  advanceTask: (task: OnboardingTask) => Promise<void>;
  loading: boolean;
  refresh: () => void;
}) {
  return (
    <section className="admin-grid">
      <div className="form-panel">
        <div className="section-head">
          <h2>Create Job Posting</h2>
          <button type="button" className="secondary-action" onClick={refresh}>Refresh</button>
        </div>
        <form onSubmit={createJob}>
          <label>
            Title
            <input value={jobDraft.title} onChange={(event) => setJobDraft({ ...jobDraft, title: event.target.value })} required />
          </label>
          <label>
            Programme
            <input value={jobDraft.programme} onChange={(event) => setJobDraft({ ...jobDraft, programme: event.target.value })} required />
          </label>
          <label>
            Modality
            <select value={jobDraft.modality} onChange={(event) => setJobDraft({ ...jobDraft, modality: event.target.value })}>
              <option>Remote</option>
              <option>Hybrid</option>
              <option>On campus</option>
            </select>
          </label>
          <label>
            Rate band
            <input value={jobDraft.rateBand} onChange={(event) => setJobDraft({ ...jobDraft, rateBand: event.target.value })} />
          </label>
          <label>
            Closing date
            <input type="date" value={jobDraft.closingDate} onChange={(event) => setJobDraft({ ...jobDraft, closingDate: event.target.value })} />
          </label>
          <label>
            Status
            <select value={jobDraft.status} onChange={(event) => setJobDraft({ ...jobDraft, status: event.target.value as JobInput["status"] })}>
              <option>Draft</option>
              <option>Live</option>
              <option>Closed</option>
            </select>
          </label>
          <label className="full">
            Description
            <textarea value={jobDraft.description} onChange={(event) => setJobDraft({ ...jobDraft, description: event.target.value })} required />
          </label>
          <button disabled={loading}>Publish job</button>
        </form>
      </div>
      <div className="stack">
        <div className="section-head">
          <h2>Postings</h2>
          <span className="pill">{jobs.length}</span>
        </div>
        {jobs.map((job) => (
          <JobEditorCard job={job} updateJob={updateJob} loading={loading} key={job.id} />
        ))}
        <div className="section-head">
          <h2>Applications</h2>
          <span className="pill">{applications.length}</span>
        </div>
        <DataTable headers={["Applicant", "Job", "Status", "Owner"]} rows={applications.slice(0, 8).map((item) => [item.applicantName, item.jobTitle, item.status, item.owner])} empty="No applications yet." />
        <div className="section-head">
          <h2>Onboarding Tasks</h2>
          <span className="pill">{tasks.length}</span>
        </div>
        <div className="stack">
          {tasks.map((task) => (
            <article className="card compact" key={task.id}>
              <div className="card-title">
                <h3>{task.title}</h3>
                <span className="pill">{task.status}</span>
              </div>
              <p>{task.assignee} - {task.dueDate}</p>
              <button disabled={loading} type="button" onClick={() => void advanceTask(task)}>Advance status</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function JobEditorCard({ job, updateJob, loading }: { job: JobPosting; updateJob: (id: string, payload: Partial<JobInput>) => Promise<void>; loading: boolean }) {
  const [draft, setDraft] = useState<JobInput>({
    title: job.title,
    programme: job.programme,
    modality: job.modality,
    rateBand: job.rateBand,
    closingDate: job.closingDate,
    status: job.status,
    description: job.description
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateJob(job.id, draft);
  }

  return (
    <article className="card compact">
      <form className="inline-edit" onSubmit={submit}>
        <label>
          Title
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          Modality
          <select value={draft.modality} onChange={(event) => setDraft({ ...draft, modality: event.target.value })}>
            <option>Remote</option>
            <option>Hybrid</option>
            <option>On campus</option>
          </select>
        </label>
        <label>
          Status
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as JobInput["status"] })}>
            <option>Draft</option>
            <option>Live</option>
            <option>Closed</option>
          </select>
        </label>
        <label className="full">
          Description
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <button disabled={loading}>Update job</button>
      </form>
    </article>
  );
}

function StaffApplications({ applications, updateApplication, loading, refresh }: { applications: ApplicationRecord[]; updateApplication: (id: string, status: ApplicationStatus, owner: string) => void; loading: boolean; refresh: () => void }) {
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Application Review</h2>
        <button type="button" className="secondary-action" onClick={refresh}>Refresh</button>
      </div>
      <DataTable
        headers={["Applicant", "Job", "Status", "Owner", "Submitted", "Action"]}
        rows={applications.map((item) => [
          item.applicantName,
          item.jobTitle,
          item.status,
          item.owner,
          item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "",
          <div className="inline-fields" key={item.id}>
            <select defaultValue={item.status} onChange={(event) => updateApplication(item.id, event.target.value as ApplicationStatus, item.owner)} disabled={loading}>
              <option>Submitted</option>
              <option>Reviewing</option>
              <option>Interview</option>
              <option>Accepted</option>
              <option>Rejected</option>
            </select>
            <input defaultValue={item.owner} onBlur={(event) => updateApplication(item.id, item.status, event.target.value)} disabled={loading} />
            <span className="code-pill">Saved on change</span>
          </div>
        ])}
        empty="No applications submitted yet."
      />
    </section>
  );
}

function ProfileDirectory({ title, profiles }: { title: string; profiles: PortalProfile[] }) {
  return (
    <section>
      <div className="section-head">
        <h2>{title}</h2>
        <span className="pill">{profiles.length} profiles</span>
      </div>
      <DataTable
        headers={["Name", "Email", "Phone", "Location", "CV", "Updated"]}
        rows={profiles.map((item) => [
          item.displayName,
          item.email,
          item.phone,
          item.location,
          item.cvWebUrl ? <a className="text-link" href={item.cvWebUrl} key={item.id}>Open CV</a> : item.cvFileName || "-",
          item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""
        ])}
        empty="No profiles saved yet."
      />
    </section>
  );
}

function Settings({ health, setupComplete, refresh }: { health: PortalHealth | null; setupComplete: number; refresh: () => void }) {
  const routes = health?.routes ?? ["GET /api/health", "GET /api/jobs", "GET /api/courses", "GET /api/classes"];
  return (
    <section className="dashboard-grid">
      <div className="command-panel">
        <div className="section-head">
          <h2>API Health</h2>
          <button type="button" className="secondary-action" onClick={refresh}>Refresh</button>
        </div>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{health?.ok ? "Online" : "Unknown"}</dd>
          </div>
          <div>
            <dt>Service</dt>
            <dd>{health?.service ?? "Waiting for API"}</dd>
          </div>
          <div>
            <dt>Setup</dt>
            <dd>{setupComplete}/{setupSteps.length}</dd>
          </div>
          <div>
            <dt>Missing settings</dt>
            <dd>{health?.missingSettings.join(", ") || "None reported"}</dd>
          </div>
        </dl>
      </div>
      <div className="command-panel">
        <h2>Indexed Routes</h2>
        <div className="route-list">
          {routes.map((route) => (
            <span className="code-pill" key={route}>{route}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Resources({ activeRole }: { activeRole: PortalRole }) {
  const common = [
    { label: "Academy home", href: HOME_URL },
    { label: "Labs", href: "https://labs.skunkworksacademy.com/" },
    { label: "Jobs", href: "https://jobs.skunkworksacademy.com/" },
    { label: "GitHub", href: "https://github.com/skunkworks-academy" }
  ];
  const roleSpecific =
    activeRole === "Student"
      ? ["Course calendar", "Class registration guide", "Learner support desk", "Certification pathway"]
      : activeRole === "Instructor"
        ? ["Instructor onboarding", "CV and credential upload", "Class assignment process", "Delivery quality checklist"]
        : ["SharePoint provisioning", "Applications pipeline", "Instructor onboarding tasks", "Student monitoring"];

  return (
    <section className="split-panel">
      <div className="command-panel">
        <div className="section-head">
          <h2>{activeRole} Resources</h2>
          <span className="pill">Role-aware</span>
        </div>
        <div className="timeline">
          {roleSpecific.map((item) => (
            <div key={item}>
              <strong>{item}</strong>
              <span>Available to {activeRole.toLowerCase()} users from the portal workspace.</span>
            </div>
          ))}
        </div>
      </div>
      <div className="command-panel">
        <h2>Academy Ecosystem</h2>
        <div className="link-grid">
          {common.map((item) => (
            <a href={item.href} key={item.label}>{item.label}</a>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProfileForm({
  profile,
  activeRole,
  editableProfile,
  setEditableProfile,
  setCvFile,
  saveProfile,
  loading
}: {
  profile: UserProfile;
  activeRole: PortalRole;
  editableProfile: PortalProfileInput;
  setEditableProfile: (value: PortalProfileInput) => void;
  setCvFile: (value: File | null) => void;
  saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  loading: boolean;
}) {
  return (
    <section className="form-panel">
      <div className="section-head">
        <h2>Profile</h2>
        <span className="pill">{activeRole}</span>
      </div>
      <form onSubmit={saveProfile}>
        <label>
          Display name
          <input value={editableProfile.displayName} onChange={(event) => setEditableProfile({ ...editableProfile, displayName: event.target.value })} placeholder={profile.name} required />
        </label>
        <label>
          Email
          <input value={profile.username} disabled />
        </label>
        <label>
          Phone
          <input value={editableProfile.phone} onChange={(event) => setEditableProfile({ ...editableProfile, phone: event.target.value })} />
        </label>
        <label>
          Location
          <input value={editableProfile.location} onChange={(event) => setEditableProfile({ ...editableProfile, location: event.target.value })} />
        </label>
        <label className="full">
          Bio
          <textarea value={editableProfile.bio} onChange={(event) => setEditableProfile({ ...editableProfile, bio: event.target.value })} />
        </label>
        <label className="full">
          CV / Resume
          <input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setCvFile(event.target.files?.[0] ?? null)} />
          <span className="field-hint">Current file: {editableProfile.cvFileName || "None uploaded"}</span>
        </label>
        <button disabled={loading}>Save profile</button>
      </form>
    </section>
  );
}

function DataTable({ headers, rows, empty = "No records found." }: { headers: string[]; rows: Array<Array<React.ReactNode>>; empty?: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import {
  apiScope,
  loginRequest,
  msalAuthority,
  portalApplicationIdUri,
  portalApplicationObjectId,
  portalClientId,
  portalCredentialSummary,
  portalManagedApplicationName,
  portalSupportedAccountTypes,
  skunkworksTenantId
} from "./authConfig";
import { portalApi } from "./api";
import { classSchedule, courseCatalog, hasStaffRole, landingRoles, roleDefinitions, roleFromClaims } from "./roles";
import type {
  ApplicationRecord,
  ClassInput,
  ClassRegistrationRecord,
  ClassSession,
  CourseRecord,
  JobInput,
  JobPosting,
  NewApplication,
  PortalHealth,
  PortalProfile,
  PortalProfileInput,
  PortalRole,
  UserProfile
} from "./types";

const BRAND_ICON_BLACK = "https://skunkworksacademy.com/images/favicon-black.png";
const BRAND_ICON_WHITE = "https://skunkworksacademy.com/images/favicon-white.png";
const HOME_URL = "https://skunkworksacademy.com/";
const PORTAL_URL = "https://portal.skunkworksacademy.com/";

const globalNav = [
  { label: "Home", href: HOME_URL },
  { label: "Self-paced", href: "https://skunkworksacademy.com/self-paced/" },
  { label: "Portal", href: PORTAL_URL },
  { label: "Labs", href: "https://labs.skunkworksacademy.com/" },
  { label: "Plans", href: "https://skunkworksacademy.com/subscriptions/#pricing" },
  { label: "Purchase", href: "https://skunkworksacademy.com/subscriptions/#purchasing" },
  { label: "Jobs", href: "https://jobs.skunkworksacademy.com/" },
  { label: "Docs", href: "https://docs.skunkworksacademy.com/" },
  { label: "IBM", href: "https://ibm.skunkworksacademy.com/" }
] as const;

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
const fallbackClasses: ClassSession[] = classSchedule.map((session) => ({
  ...session,
  courseTitle: courseCatalog.find((course) => course.id === session.courseId)?.title ?? session.title,
  modality: "Hybrid",
  enrolled: 0,
  status: "Open"
}));

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

const defaultProfileInput: PortalProfileInput = {
  displayName: "",
  portalRole: "Student",
  phone: "",
  location: "",
  bio: "",
  cvFileName: ""
};

const enterpriseAppDetails = [
  ["Display name", portalManagedApplicationName],
  ["Application / client ID", portalClientId],
  ["Object ID", portalApplicationObjectId],
  ["Directory / tenant ID", skunkworksTenantId],
  ["Supported account types", portalSupportedAccountTypes],
  ["Client credentials", portalCredentialSummary],
  ["Redirect URI", `${PORTAL_URL}`],
  ["Application ID URI", portalApplicationIdUri],
  ["Delegated API scope", apiScope],
  ["Authority", msalAuthority]
] as const;

function claimsFromAccount(account?: AccountInfo | null) {
  return (account?.idTokenClaims ?? {}) as Record<string, unknown>;
}

function rolesFromClaims(claims: Record<string, unknown>) {
  return Array.isArray(claims.roles) ? claims.roles.map(String) : [];
}

function getProfile(account?: AccountInfo | null): UserProfile | null {
  if (!account) return null;
  const claims = claimsFromAccount(account);
  const roles = rolesFromClaims(claims);
  const tenantId = typeof claims.tid === "string" ? claims.tid : account.tenantId;
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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatRole(profile: UserProfile | null, selectedRole: PortalRole) {
  if (!profile) return selectedRole;
  if (profile.isAdmin) return profile.roles.map((role) => role.toLowerCase()).includes("portal.admin") ? "Portal.Admin" : "Portal.Staff";
  return profile.portalRole;
}

export function App() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const profile = useMemo(() => getProfile(account), [account]);
  const [selectedRole, setSelectedRole] = useState<PortalRole>(() => {
    const stored = localStorage.getItem("portalRoleOverride");
    return stored === "Instructor" || stored === "Staff" || stored === "Student" ? stored : "Student";
  });
  const activeRole = profile?.portalRole ?? selectedRole;
  const roleDefinition = roleDefinitions[activeRole];
  const auth = account ? { instance, account } : undefined;

  const [health, setHealth] = useState<PortalHealth | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>(fallbackJobs);
  const [courses, setCourses] = useState<CourseRecord[]>(fallbackCourses);
  const [classes, setClasses] = useState<ClassSession[]>(fallbackClasses);
  const [registrations, setRegistrations] = useState<ClassRegistrationRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [adminApplications, setAdminApplications] = useState<ApplicationRecord[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<PortalProfile[]>([]);
  const [portalProfile, setPortalProfile] = useState<PortalProfileInput>(defaultProfileInput);
  const [jobDraft, setJobDraft] = useState<JobInput>(emptyJob);
  const [classDraft, setClassDraft] = useState<ClassInput>(emptyClass);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(role: PortalRole) {
    localStorage.setItem("portalRoleOverride", role);
    setSelectedRole(role);
    setPortalProfile((current) => ({ ...current, portalRole: role }));
  }

  async function signIn(role?: PortalRole) {
    if (role) selectRole(role);
    await instance.loginRedirect(loginRequest);
  }

  async function signOut() {
    await instance.logoutRedirect();
  }

  async function run(action: () => Promise<void>, success?: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (success) setNotice(success);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The portal operation failed.";
      setError(message.includes("Failed to fetch") ? "The Azure Functions API could not be reached. Confirm deployment, CORS, and /api/health." : message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPublicData() {
      const [healthResult, jobsResult, coursesResult, classesResult] = await Promise.allSettled([
        portalApi.health(),
        portalApi.jobs(),
        portalApi.courses(),
        portalApi.classes()
      ]);

      if (cancelled) return;
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      if (jobsResult.status === "fulfilled" && jobsResult.value.length > 0) setJobs(jobsResult.value);
      if (coursesResult.status === "fulfilled" && coursesResult.value.length > 0) setCourses(coursesResult.value);
      if (classesResult.status === "fulfilled" && classesResult.value.length > 0) setClasses(classesResult.value);
    }

    void loadPublicData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!auth || !profile) return;
    void run(async () => {
      const saved = await portalApi.myProfile(auth);
      setPortalProfile(
        saved
          ? {
              displayName: saved.displayName,
              portalRole: saved.portalRole,
              phone: saved.phone,
              location: saved.location,
              bio: saved.bio,
              cvFileName: saved.cvFileName
            }
          : {
              ...defaultProfileInput,
              displayName: profile.name,
              portalRole: activeRole
            }
      );
    });
  }, [account?.homeAccountId]);

  useEffect(() => {
    if (!auth || activeRole !== "Student") return;
    void run(async () => {
      setRegistrations(await portalApi.myClasses(auth));
    });
  }, [account?.homeAccountId, activeRole]);

  useEffect(() => {
    if (!auth || activeRole !== "Instructor") return;
    void run(async () => {
      setApplications(await portalApi.myApplications(auth));
    });
  }, [account?.homeAccountId, activeRole]);

  useEffect(() => {
    if (!auth || !profile?.isAdmin) return;
    void run(async () => {
      const [nextApplications, nextProfiles] = await Promise.all([portalApi.adminApplications(auth), portalApi.adminProfiles(auth)]);
      setAdminApplications(nextApplications);
      setAdminProfiles(nextProfiles);
    });
  }, [account?.homeAccountId, profile?.isAdmin]);

  async function registerForClass(classId: string) {
    if (!auth) {
      await signIn("Student");
      return;
    }

    await run(async () => {
      await portalApi.registerClass(classId, auth);
      setRegistrations(await portalApi.myClasses(auth));
      const nextClasses = await portalApi.classes();
      setClasses(nextClasses.length ? nextClasses : fallbackClasses);
    }, "Class registration saved.");
  }

  async function assignClass(classId: string) {
    if (!auth) {
      await signIn("Instructor");
      return;
    }

    await run(async () => {
      await portalApi.assignInstructor(classId, auth);
      const nextClasses = await portalApi.classes();
      setClasses(nextClasses.length ? nextClasses : fallbackClasses);
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
    const resume = data.get("resume") as File | null;
    const payload: NewApplication = {
      jobId: String(data.get("jobId")),
      applicantName: String(data.get("applicantName")),
      applicantEmail: String(data.get("applicantEmail")),
      phone: String(data.get("phone")),
      discipline: String(data.get("discipline")),
      availability: String(data.get("availability")),
      experience: String(data.get("experience")),
      resumeFileName: resume?.name || undefined,
      resumeBase64: resume && resume.size > 0 ? await readFileAsBase64(resume) : undefined
    };

    await run(async () => {
      await portalApi.submitApplication(payload, auth);
      setApplications(await portalApi.myApplications(auth));
      form.reset();
    }, "Instructor application submitted.");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) {
      await signIn(activeRole);
      return;
    }

    await run(async () => {
      const saved = await portalApi.updateProfile({ ...portalProfile, portalRole: activeRole }, auth);
      setPortalProfile({
        displayName: saved.displayName,
        portalRole: saved.portalRole,
        phone: saved.phone,
        location: saved.location,
        bio: saved.bio,
        cvFileName: saved.cvFileName
      });
    }, "Profile saved.");
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !profile?.isAdmin) return;

    await run(async () => {
      await portalApi.createJob(jobDraft, auth);
      setJobDraft(emptyJob);
      const nextJobs = await portalApi.jobs();
      setJobs(nextJobs.length ? nextJobs : fallbackJobs);
    }, "Job posting saved.");
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !profile?.isAdmin) return;

    await run(async () => {
      await portalApi.createClass(classDraft, auth);
      setClassDraft(emptyClass);
      const nextClasses = await portalApi.classes();
      setClasses(nextClasses.length ? nextClasses : fallbackClasses);
    }, "Class schedule saved.");
  }

  const liveJobs = jobs.filter((job) => job.status === "Live");
  const visibleJobs = liveJobs.length ? liveJobs : fallbackJobs;
  const registeredClassIds = new Set(registrations.map((registration) => registration.classId));
  const roleBadge = formatRole(profile, activeRole);

  return (
    <div className="portal-page">
      <GlobalHeader isAuthenticated={Boolean(profile)} userName={profile?.name} signIn={() => void signIn(activeRole)} signOut={() => void signOut()} />
      <main id="main" className="portal-main">
        <section className="portal-hero" id="overview">
          <div className="hero-copy">
            <p>Skunkworks Academy Portal</p>
            <h1>One operational front door for learners, instructors, staff and Entra-connected Academy services.</h1>
            <span>
              The rebuilt portal exposes the global Academy menu, Microsoft sign-in, Entra Enterprise Application details, course registration, instructor applications, profile capture and staff operations readiness from one responsive interface.
            </span>
            <div className="landing-actions">
              <button type="button" className="primary-action large" onClick={() => void signIn(activeRole)}>
                {profile ? "Refresh Microsoft session" : "Sign in with Microsoft"}
              </button>
              <a className="ghost-action large" href="https://skunkworksacademy.com/self-paced/">Browse self-paced catalogue</a>
            </div>
          </div>
          <div className="landing-stats" aria-label="Portal summary">
            <Metric value={courses.length} label="Courses" />
            <Metric value={classes.length} label="Scheduled classes" />
            <Metric value={visibleJobs.length} label="Instructor roles" />
          </div>
        </section>

        {(notice || error) && <div className={error ? "alert error" : "alert"}>{error || notice}</div>}
        {loading && <div className="alert warning">Working on the portal request…</div>}

        <section className="workspace-grid" aria-label="Portal workspaces">
          <div className="section-head full-span">
            <div>
              <p className="eyebrow">Workspace selection</p>
              <h2>{profile ? `${profile.name}'s ${activeRole} workspace` : "Choose your entry path"}</h2>
              <span>Current access: {roleBadge}. Entra roles override the manual preview role after sign-in.</span>
            </div>
          </div>
          {landingRoles.map((item) => (
            <article className={item.role === activeRole ? "role-entry selected" : "role-entry"} key={item.role}>
              <div>
                <p className="eyebrow">{item.role}</p>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
              <button type="button" onClick={() => selectRole(item.role)}>
                Use {item.role} view
              </button>
            </article>
          ))}
        </section>

        <section className="dashboard-grid" aria-label="Portal dashboard">
          <CommandPanel title={roleDefinition.headline} eyebrow="Role capability map">
            <p>{roleDefinition.summary}</p>
            <div className="pill-grid">
              {roleDefinition.capabilities.map((capability) => <span className="pill" key={capability}>{capability}</span>)}
            </div>
            <div className="resource-list">
              {roleDefinition.resources.map((resource) => (
                <article key={resource.title}>
                  <strong>{resource.title}</strong>
                  <span>{resource.detail}</span>
                </article>
              ))}
            </div>
          </CommandPanel>

          <EnterpriseAppPanel health={health} />
        </section>

        <section className="content-grid" aria-label="Courses and classes">
          <CourseSection courses={courses} />
          <ClassSection classes={classes} registeredClassIds={registeredClassIds} activeRole={activeRole} registerForClass={registerForClass} assignClass={assignClass} />
        </section>

        <section className="content-grid" aria-label="Instructor jobs and profile">
          <JobSection jobs={visibleJobs} profile={profile} submitApplication={submitApplication} />
          <ProfilePanel profile={profile} activeRole={activeRole} portalProfile={portalProfile} setPortalProfile={setPortalProfile} saveProfile={saveProfile} />
        </section>

        <section className="content-grid" aria-label="Role-specific operations">
          {activeRole === "Instructor" && <ApplicationsPanel applications={applications} />}
          {activeRole === "Student" && <RegistrationsPanel registrations={registrations} />}
          {(activeRole === "Staff" || profile?.isAdmin) && (
            <StaffOperations
              profile={profile}
              applications={adminApplications}
              profiles={adminProfiles}
              jobDraft={jobDraft}
              setJobDraft={setJobDraft}
              classDraft={classDraft}
              setClassDraft={setClassDraft}
              createJob={createJob}
              createClass={createClass}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function Brand({ eyebrow }: { eyebrow: string }) {
  return (
    <a className="brand" href={HOME_URL} aria-label="Skunkworks Academy home">
      <img className="brand-logo logo-light" src={BRAND_ICON_BLACK} alt="" />
      <img className="brand-logo logo-dark" src={BRAND_ICON_WHITE} alt="" />
      <span>Skunkworks Academy <span className="brand-section">{eyebrow}</span></span>
    </a>
  );
}

function GlobalHeader({ isAuthenticated, userName, signIn, signOut }: { isAuthenticated: boolean; userName?: string; signIn: () => void; signOut: () => void }) {
  return (
    <header className="top" data-fallback-header="true">
      <div className="shell nav">
        <Brand eyebrow="Portal" />
        <nav className="links" aria-label="Primary portal navigation">
          {globalNav.map((item) => (
            <a href={item.href} key={item.label} aria-current={item.href === PORTAL_URL ? "page" : undefined}>{item.label}</a>
          ))}
          {isAuthenticated ? (
            <>
              <span className="nav-user">{userName}</span>
              <button type="button" className="nav-action" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button type="button" className="nav-action microsoft-signin" onClick={signIn}>Microsoft sign-in</button>
          )}
        </nav>
      </div>
    </header>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CommandPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <article className="command-panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function EnterpriseAppPanel({ health }: { health: PortalHealth | null }) {
  return (
    <CommandPanel title="Microsoft Entra connection" eyebrow="Enterprise application details">
      <p>The portal is wired for MSAL sign-in and API access tokens using the configured Entra application details below.</p>
      <dl className="detail-list">
        {enterpriseAppDetails.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>API health</dt>
          <dd>{health ? (health.missingSettings.length ? `Missing: ${health.missingSettings.join(", ")}` : "Healthy") : "Not checked"}</dd>
        </div>
      </dl>
    </CommandPanel>
  );
}

function CourseSection({ courses }: { courses: CourseRecord[] }) {
  return (
    <section className="command-panel">
      <p className="eyebrow">Learning catalogue</p>
      <h2>Courses</h2>
      <div className="card-grid">
        {courses.map((course) => (
          <article className="card" key={course.id}>
            <span className="pill">{course.level}</span>
            <h3>{course.title}</h3>
            <p>{course.description}</p>
            <dl>
              <div><dt>Duration</dt><dd>{course.duration}</dd></div>
              <div><dt>Status</dt><dd>{course.status}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ClassSection({
  classes,
  registeredClassIds,
  activeRole,
  registerForClass,
  assignClass
}: {
  classes: ClassSession[];
  registeredClassIds: Set<string>;
  activeRole: PortalRole;
  registerForClass: (classId: string) => Promise<void>;
  assignClass: (classId: string) => Promise<void>;
}) {
  return (
    <section className="command-panel">
      <p className="eyebrow">Scheduling</p>
      <h2>Classes</h2>
      <div className="card-grid">
        {classes.map((classItem) => (
          <article className="card" key={classItem.id}>
            <span className="pill success">{classItem.status}</span>
            <h3>{classItem.title}</h3>
            <p>{classItem.courseTitle}</p>
            <dl>
              <div><dt>Schedule</dt><dd>{classItem.schedule}</dd></div>
              <div><dt>Mode</dt><dd>{classItem.modality}</dd></div>
              <div><dt>Instructor</dt><dd>{classItem.instructor}</dd></div>
              <div><dt>Seats</dt><dd>{classItem.enrolled}/{classItem.seats}</dd></div>
            </dl>
            {activeRole === "Student" && (
              <button type="button" disabled={registeredClassIds.has(classItem.id)} onClick={() => void registerForClass(classItem.id)}>
                {registeredClassIds.has(classItem.id) ? "Registered" : "Register"}
              </button>
            )}
            {activeRole === "Instructor" && <button type="button" onClick={() => void assignClass(classItem.id)}>Assign to me</button>}
          </article>
        ))}
      </div>
    </section>
  );
}

function JobSection({ jobs, profile, submitApplication }: { jobs: JobPosting[]; profile: UserProfile | null; submitApplication: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return (
    <section className="command-panel">
      <p className="eyebrow">Instructor pipeline</p>
      <h2>Open roles</h2>
      <div className="card-grid">
        {jobs.map((job) => (
          <article className="card" key={job.id}>
            <span className="pill">{job.modality}</span>
            <h3>{job.title}</h3>
            <p>{job.description}</p>
            <dl>
              <div><dt>Programme</dt><dd>{job.programme}</dd></div>
              <div><dt>Rate</dt><dd>{job.rateBand || "TBC"}</dd></div>
              <div><dt>Applicants</dt><dd>{job.applicants}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <form className="form-panel" onSubmit={(event) => void submitApplication(event)}>
        <h3 className="full">Apply for an instructor role</h3>
        <label>Role
          <select name="jobId" required>
            {jobs.map((job) => <option value={job.id} key={job.id}>{job.title}</option>)}
          </select>
        </label>
        <label>Name<input name="applicantName" required defaultValue={profile?.name ?? ""} /></label>
        <label>Email<input name="applicantEmail" required type="email" defaultValue={profile?.username ?? ""} /></label>
        <label>Phone<input name="phone" /></label>
        <label>Discipline<input name="discipline" placeholder="Microsoft, IBM, Cisco, AI, Security..." /></label>
        <label>Availability<input name="availability" placeholder="Weekdays, evenings, remote, onsite..." /></label>
        <label className="full">Experience<textarea name="experience" required placeholder="Summarise delivery capability, certifications, labs, and preferred courses." /></label>
        <label className="full">CV / resume<input name="resume" type="file" /></label>
        <button type="submit">Submit application</button>
      </form>
    </section>
  );
}

function ProfilePanel({
  profile,
  activeRole,
  portalProfile,
  setPortalProfile,
  saveProfile
}: {
  profile: UserProfile | null;
  activeRole: PortalRole;
  portalProfile: PortalProfileInput;
  setPortalProfile: React.Dispatch<React.SetStateAction<PortalProfileInput>>;
  saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="command-panel">
      <p className="eyebrow">Identity and profile</p>
      <h2>{profile ? "Connected Microsoft profile" : "Profile capture"}</h2>
      <dl className="detail-list compact">
        <div><dt>Name</dt><dd>{profile?.name ?? "Not signed in"}</dd></div>
        <div><dt>Email</dt><dd>{profile?.username ?? "Sign in required"}</dd></div>
        <div><dt>Tenant</dt><dd>{profile?.tenantId ?? skunkworksTenantId}</dd></div>
        <div><dt>Role</dt><dd>{formatRole(profile, activeRole)}</dd></div>
      </dl>
      <form className="form-panel" onSubmit={(event) => void saveProfile(event)}>
        <label>Display name<input value={portalProfile.displayName} onChange={(event) => setPortalProfile((current) => ({ ...current, displayName: event.target.value }))} /></label>
        <label>Phone<input value={portalProfile.phone} onChange={(event) => setPortalProfile((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label>Location<input value={portalProfile.location} onChange={(event) => setPortalProfile((current) => ({ ...current, location: event.target.value }))} /></label>
        <label>Role
          <select value={portalProfile.portalRole} onChange={(event) => setPortalProfile((current) => ({ ...current, portalRole: event.target.value as PortalRole }))}>
            <option value="Student">Student</option>
            <option value="Instructor">Instructor</option>
            <option value="Staff">Staff</option>
          </select>
        </label>
        <label className="full">Bio<textarea value={portalProfile.bio} onChange={(event) => setPortalProfile((current) => ({ ...current, bio: event.target.value }))} /></label>
        <button type="submit">Save profile</button>
      </form>
    </section>
  );
}

function ApplicationsPanel({ applications }: { applications: ApplicationRecord[] }) {
  return (
    <section className="command-panel full-width">
      <p className="eyebrow">Instructor status</p>
      <h2>My applications</h2>
      <RecordList empty="No applications submitted yet." records={applications.map((application) => ({
        id: application.id,
        title: application.jobTitle,
        detail: `${application.status} · ${application.owner || "Unassigned"} · ${application.submittedAt}`
      }))} />
    </section>
  );
}

function RegistrationsPanel({ registrations }: { registrations: ClassRegistrationRecord[] }) {
  return (
    <section className="command-panel full-width">
      <p className="eyebrow">Student status</p>
      <h2>My class registrations</h2>
      <RecordList empty="No class registrations yet." records={registrations.map((registration) => ({
        id: registration.id,
        title: registration.classTitle,
        detail: `${registration.courseTitle} · ${registration.status} · ${registration.registeredAt}`
      }))} />
    </section>
  );
}

function StaffOperations({
  profile,
  applications,
  profiles,
  jobDraft,
  setJobDraft,
  classDraft,
  setClassDraft,
  createJob,
  createClass
}: {
  profile: UserProfile | null;
  applications: ApplicationRecord[];
  profiles: PortalProfile[];
  jobDraft: JobInput;
  setJobDraft: React.Dispatch<React.SetStateAction<JobInput>>;
  classDraft: ClassInput;
  setClassDraft: React.Dispatch<React.SetStateAction<ClassInput>>;
  createJob: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createClass: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="command-panel full-width">
      <p className="eyebrow">Staff operations</p>
      <h2>Admin control surface</h2>
      {!profile?.isAdmin && <div className="alert warning">Staff writes require `Portal.Admin` or `Portal.Staff` app role assignment in the Enterprise Application.</div>}
      <div className="content-grid embedded">
        <form className="form-panel" onSubmit={(event) => void createJob(event)}>
          <h3 className="full">Create job posting</h3>
          <label>Title<input value={jobDraft.title} onChange={(event) => setJobDraft((current) => ({ ...current, title: event.target.value }))} required /></label>
          <label>Programme<input value={jobDraft.programme} onChange={(event) => setJobDraft((current) => ({ ...current, programme: event.target.value }))} /></label>
          <label>Modality<input value={jobDraft.modality} onChange={(event) => setJobDraft((current) => ({ ...current, modality: event.target.value }))} /></label>
          <label>Rate band<input value={jobDraft.rateBand} onChange={(event) => setJobDraft((current) => ({ ...current, rateBand: event.target.value }))} /></label>
          <label>Status
            <select value={jobDraft.status} onChange={(event) => setJobDraft((current) => ({ ...current, status: event.target.value as JobInput["status"] }))}>
              <option value="Draft">Draft</option>
              <option value="Live">Live</option>
              <option value="Closed">Closed</option>
            </select>
          </label>
          <label>Closing date<input type="date" value={jobDraft.closingDate} onChange={(event) => setJobDraft((current) => ({ ...current, closingDate: event.target.value }))} /></label>
          <label className="full">Description<textarea value={jobDraft.description} onChange={(event) => setJobDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          <button type="submit" disabled={!profile?.isAdmin}>Save job</button>
        </form>

        <form className="form-panel" onSubmit={(event) => void createClass(event)}>
          <h3 className="full">Create class schedule</h3>
          <label>Course ID<input value={classDraft.courseId} onChange={(event) => setClassDraft((current) => ({ ...current, courseId: event.target.value }))} required /></label>
          <label>Course title<input value={classDraft.courseTitle} onChange={(event) => setClassDraft((current) => ({ ...current, courseTitle: event.target.value }))} required /></label>
          <label>Class title<input value={classDraft.title} onChange={(event) => setClassDraft((current) => ({ ...current, title: event.target.value }))} required /></label>
          <label>Schedule<input value={classDraft.schedule} onChange={(event) => setClassDraft((current) => ({ ...current, schedule: event.target.value }))} /></label>
          <label>Instructor<input value={classDraft.instructor} onChange={(event) => setClassDraft((current) => ({ ...current, instructor: event.target.value }))} /></label>
          <label>Seats<input type="number" min="1" value={classDraft.seats} onChange={(event) => setClassDraft((current) => ({ ...current, seats: Number(event.target.value) }))} /></label>
          <button type="submit" disabled={!profile?.isAdmin}>Save class</button>
        </form>
      </div>
      <div className="content-grid embedded">
        <RecordList empty="No admin applications loaded." records={applications.map((application) => ({ id: application.id, title: application.applicantName, detail: `${application.jobTitle} · ${application.status}` }))} />
        <RecordList empty="No profiles loaded." records={profiles.map((portalProfile) => ({ id: portalProfile.id, title: portalProfile.displayName, detail: `${portalProfile.portalRole} · ${portalProfile.email}` }))} />
      </div>
    </section>
  );
}

function RecordList({ empty, records }: { empty: string; records: Array<{ id: string; title: string; detail: string }> }) {
  if (records.length === 0) return <p>{empty}</p>;
  return (
    <div className="record-list">
      {records.map((record) => (
        <article key={record.id}>
          <strong>{record.title}</strong>
          <span>{record.detail}</span>
        </article>
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { portalApi } from "./api";
import { classRegistrationAction, type ClassRegistrationFeedback } from "./class-registration-ui";
import { LearnerDiscovery, PersonalisedLearningOverview } from "./LearnerDiscovery";
import {
  deleteBrowserLearnerPreferences,
  readBrowserLearnerPreferences,
  shouldShowSkunkieWelcome,
  saveBrowserLearnerPreferences,
  validateLearnerPreferences,
  type LearnerPreferences
} from "./learner-adaptation";
import { SKUNKIE_AVATAR_SRC } from "./skunkie-assets";
import { SkunkieOrchestrationPanel } from "./skunkie/SkunkieOrchestrationPanel";
import { skunkworksTenantId } from "./authConfig";
import { LmsWorkspace } from "./lms-workspace";
import { CourseDiscovery } from "./CourseDiscovery";
import { CareerResources } from "./CareerResources";
import { PortalSidebarNavigation, usePortalSidebar } from "./PortalSidebarNavigation";
import { LearnerAssessmentWorkspace, IndividualRoadmapWorkspace } from "./learner-assessment/workspace";
import { linkedAcademyServices } from "./academy-service-registry";
import { availableServices, PortalServiceNotice, type PortalServiceAvailability } from "./service-availability";
import type { ClassRegistrationRecord, ClassSession, CourseRecord, PortalProfileInput, UserProfile } from "./types";
import "./student-experience.css";

type StudentView = "dashboard" | "assessment" | "idr" | "lms" | "learning" | "browse" | "classes" | "achievements" | "resources" | "messages" | "companion" | "profile" | "career";

type StudentExperienceProps = {
  profile: UserProfile | null;
  portalProfile: PortalProfileInput;
  courses: CourseRecord[];
  classes: ClassSession[];
  registrations: ClassRegistrationRecord[];
  onSignIn: () => void;
  onSignOut: () => void;
  onRegister: (classId: string) => Promise<void>;
  registrationBusyClassId?: string | null;
  registrationFeedback?: ClassRegistrationFeedback | null;
  services?: PortalServiceAvailability;
  onRetryServices?: () => void;
};

const navItems: Array<{ id: StudentView; label: string; icon: string }> = [
  { id: "companion", label: "Skunkie", icon: "✺" },
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "assessment", label: "My learner assessment", icon: "◈" },
  { id: "idr", label: "My development roadmap", icon: "◇" },
  { id: "lms", label: "Academy LMS", icon: "▤" },
  { id: "learning", label: "My learning", icon: "◈" },
  { id: "browse", label: "Browse courses", icon: "⌕" },
  { id: "career", label: "Career & jobs", icon: "↗" },
  { id: "classes", label: "Classes", icon: "◫" },
  { id: "achievements", label: "Achievements", icon: "✦" },
  { id: "resources", label: "Resources", icon: "▤" },
  { id: "messages", label: "Messages", icon: "✉" },
  { id: "profile", label: "Profile & settings", icon: "◌" }
];

function studentViewFromLocation(): StudentView {
  if (typeof window === "undefined") return "companion";
  const requested = new URLSearchParams(window.location.search).get("student");
  if (requested === "profile") { window.location.replace("/?account=profile"); return "dashboard"; }
  return navItems.find(item => item.id === requested)?.id ?? "companion";
}

const resources = [
  { title: "Azure overview", type: "Microsoft Learn", detail: "A concise entry point for cloud concepts and services.", href: "https://learn.microsoft.com/training/azure/" },
  { title: "Virtual machines lab", type: "Hands-on lab", detail: "Practise provisioning and managing an Azure virtual machine.", href: "https://learn.microsoft.com/training/" },
  { title: "Exam revision checklist", type: "Download", detail: "Use this checklist to structure your revision time.", href: "https://skunkworksacademy.com/self-paced/" }
];


export function StudentExperience({
  profile,
  portalProfile,
  classes,
  registrations,
  onSignIn,
  onSignOut,
  onRegister,
  registrationBusyClassId = null,
  registrationFeedback = null,
  services = availableServices,
  onRetryServices
}: StudentExperienceProps) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const sidebar = usePortalSidebar();
  const accountId = account?.homeAccountId ?? "";
  const canSyncAcademyAccount = profile?.tenantId?.toLowerCase() === skunkworksTenantId.toLowerCase();
  // Private pilot is opt-in until real authenticated browser acceptance testing is complete.
  const adaptivePilot = Boolean(account && profile) && (
    import.meta.env.VITE_ENABLE_SKUNKIE_ADAPTIVE === "true" ||
    new URLSearchParams(window.location.search).get("skunkiePilot") === "1"
  );
  const [view, updateView] = useState<StudentView>(studentViewFromLocation);
  function setView(next: StudentView) {
    if (next === "profile") { window.location.assign("/?account=profile"); return; }
    updateView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("student", next);
    window.history.pushState(null, "", url);
  }
  useEffect(() => {
    const onHistory = () => updateView(studentViewFromLocation());
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);
  const [learnerState, setLearnerState] = useState<{ accountId: string; data: LearnerPreferences } | null>(null);
  const learnerPreferences = learnerState?.accountId === accountId ? learnerState.data : null;
  // Track account-side persistence separately from browser data so a learner can revoke it.
  const [cloudSyncedAccountId, setCloudSyncedAccountId] = useState<string | null>(null);
  const [learnerReady, setLearnerReady] = useState(false);
  const [learnerEditing, setLearnerEditing] = useState(false);
  const [learnerSkipped, setLearnerSkipped] = useState(false);
  const [learnerBusy, setLearnerBusy] = useState(false);
  const [learnerNotice, setLearnerNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLearnerEditing(false);
    setLearnerSkipped(false);
    setLearnerReady(false);
    setLearnerNotice("");
    setCloudSyncedAccountId(null);
    if (!account || !adaptivePilot) {
      setLearnerState(null);
      setLearnerReady(true);
      return;
    }
    const identity = account.homeAccountId;
    const cached = readBrowserLearnerPreferences(identity);
    setLearnerState(cached ? { accountId: identity, data: cached } : null);
    if (cached) setLearnerNotice("These preferences are saved on this browser; checking account sync.");
    if (!canSyncAcademyAccount) {
      setLearnerNotice(cached
        ? "Preferences loaded from this browser. Academy account sync is not available for this Microsoft account."
        : "Choose your preferences. Your personal Microsoft account can use browser or session storage.");
      setLearnerReady(true);
      return;
    }
    void portalApi.learnerPreferences({ account, instance }).then(saved => {
      if (cancelled) return;
      if (saved) {
        const validated = validateLearnerPreferences(saved);
        if (validated) {
          setLearnerState({ accountId: identity, data: validated });
          setCloudSyncedAccountId(identity);
          setLearnerNotice("Your preferences were loaded securely from your Academy account.");
        }
      } else if (!cached) {
        setLearnerNotice("Choose how you'd like to learn. Your profile is not yet saved.");
      }
    }).catch(() => {
      if (!cancelled) setLearnerNotice("Account sync is not currently available. You can still personalise this session.");
    }).finally(() => { if (!cancelled) setLearnerReady(true); });
    return () => { cancelled = true; };
  }, [accountId, adaptivePilot, canSyncAcademyAccount, instance]);

  async function saveLearnerPreferences(preferences: LearnerPreferences, remember: boolean) {
    if (!account || !accountId) return;
    const validated = validateLearnerPreferences(preferences);
    if (!validated) return;
    setLearnerBusy(true);
    let notice = "Your choices apply to this session only.";
    try {
      if (remember && !canSyncAcademyAccount) {
        notice = "Saved on this browser only. Account-wide sync is not available for this Microsoft account.";
      } else if (remember) {
        try {
          await portalApi.saveLearnerPreferences(validated, { instance, account });
          setCloudSyncedAccountId(accountId);
          notice = "Your preferences are saved securely to your Academy account.";
        } catch {
          notice = "Cloud sync is unavailable. Your preferences are only saved on this browser, not across devices.";
        }
      } else if (cloudSyncedAccountId === accountId) {
        // Opting out of durable storage must also revoke a previously saved account copy.
        try {
          await portalApi.deleteLearnerPreferences({ instance, account });
          setCloudSyncedAccountId(null);
          notice = "Your earlier account copy was deleted. These choices apply to this session only.";
        } catch {
          notice = "Session-only choices are active, but your earlier account copy could not be removed. Use Reset to retry deletion.";
        }
      }
      try {
        saveBrowserLearnerPreferences(accountId, validated, remember);
      } catch {
        if (notice.includes("could not be removed")) {
          notice += " Browser storage is also unavailable.";
        } else if (!remember || notice.startsWith("Cloud sync")) {
          notice = "Browser storage is unavailable. Your preferences apply to this page only.";
        }
      }
      setLearnerState({ accountId, data: validated });
      setLearnerNotice(notice);
      setLearnerEditing(false);
      setLearnerSkipped(false);
    } finally { setLearnerBusy(false); }
  }

  async function resetLearnerPreferences() {
    if (!account || !accountId) return;
    setLearnerBusy(true);
    try {
      try { deleteBrowserLearnerPreferences(accountId); } catch { /* browser storage may be disabled */ }
      if (!canSyncAcademyAccount) {
        setCloudSyncedAccountId(null);
        setLearnerNotice("Browser preferences reset. Academy account storage is not available for this Microsoft account.");
      } else {
        try {
          await portalApi.deleteLearnerPreferences({ account, instance });
          setCloudSyncedAccountId(null);
          setLearnerNotice("Your saved learner preferences were deleted.");
        } catch {
          setLearnerNotice("Local preferences were reset. Account-side deletion could not be confirmed.");
        }
      }
      setLearnerState(null);
      setLearnerEditing(false);
      setLearnerSkipped(false);
    } finally { setLearnerBusy(false); }
  }
  const [query, setQuery] = useState("");
  const [expandedRegistrationClassId, setExpandedRegistrationClassId] = useState<string | null>(null);
  useEffect(() => { setQuery(""); }, [accountId]);
  const displayName = portalProfile.displayName || profile?.name || "Learner";
  const activeRegistrations = useMemo(() => registrations.filter((registration) => registration.status !== "Cancelled"), [registrations]);
  const registeredClassIds = useMemo(() => new Set(activeRegistrations.map((registration) => registration.classId)), [activeRegistrations]);
  const registrationByClass = useMemo(() => new Map(activeRegistrations.map((registration) => [registration.classId, registration])), [activeRegistrations]);
  const nextClass = classes.find((classItem) => registeredClassIds.has(classItem.id));
  const firstLoginSkunkie = shouldShowSkunkieWelcome(adaptivePilot, learnerReady, Boolean(learnerPreferences), learnerSkipped);


  return (
    <div className="student-shell" data-skunkie-welcome={firstLoginSkunkie ? "true" : undefined}
      data-learner-palette={adaptivePilot ? learnerPreferences?.palette : undefined}
      data-learner-text={adaptivePilot ? learnerPreferences?.textSize : undefined}
      data-reduce-motion={adaptivePilot && learnerPreferences?.reduceMotion ? "true" : undefined}>
      <a className="skip-link" href="#student-main">Skip to student content</a>
      <button className="portal-sidebar-fallback-toggle" type="button" onClick={sidebar.toggle} aria-expanded={sidebar.open} aria-controls="academy-portal-sidebar">Workspace navigation</button>
      {sidebar.open && <button className="portal-sidebar-overlay" type="button" onClick={sidebar.close} aria-label="Close workspace navigation" />}
      <aside id="academy-portal-sidebar" className={sidebar.open ? "student-sidebar is-open" : "student-sidebar"} aria-label="Student navigation">
        <a className="student-brand" href="https://skunkworksacademy.com/" aria-label="Skunkworks Academy home">
          <span className="student-brand-mark" aria-hidden="true">
            <img className="academy-menu-icon academy-menu-icon--dark" src="https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-white.png" alt="" />
            <img className="academy-menu-icon academy-menu-icon--light" src="https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png" alt="" />
          </span>
          <span><strong>Skunkworks</strong><small>Academy · Student</small></span>
        </a>
        <nav className="student-nav">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "student-nav-item active" : "student-nav-item"}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => { if (item.id === "profile") { window.location.assign("/?account=profile"); return; } setView(item.id); if (!window.matchMedia("(min-width: 921px)").matches) sidebar.close(); }}
            >
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <PortalSidebarNavigation onNavigate={sidebar.close} />
        <div className="student-sidebar-footer">
          <button type="button" className="student-profile-link" onClick={() => window.location.assign("/?account=profile")}>
            <span className="student-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{displayName}</strong><small>Student account</small></span>
          </button>
          {profile ? <button type="button" className="student-signout" onClick={onSignOut}>Sign out</button> : <button type="button" className="student-signout" onClick={onSignIn}>Sign in</button>}
        </div>
      </aside>

      <section className="student-workspace">
        <header className="student-topbar">
          <div>
            <p className="student-kicker">Learner portal</p>
            <h1>{view === "dashboard" ? `Welcome back, ${displayName.split(" ")[0]}` : navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <label className="student-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !["learning", "lms", "resources"].includes(view)) setView("browse"); }} placeholder="Search courses and resources" aria-label="Search courses and resources; press Enter to browse courses" />
          </label>
        </header>

        <main id="student-main" className="student-main">
          {onRetryServices && <PortalServiceNotice services={services} onRetry={onRetryServices} />}
          {!profile && (
            <section className="student-signin-banner">
              <div><strong>Unlock your personal learning space.</strong><span>Sign in to save registrations, learning progress, and profile preferences.</span></div>
              <button type="button" onClick={onSignIn}>Sign in with Microsoft</button>
            </section>
          )}

          {view === "dashboard" && adaptivePilot && learnerNotice && (
            <p role="status" aria-live="polite" className="learner-account-status">{learnerNotice}</p>
          )}
          {view === "dashboard" && adaptivePilot && !learnerReady && (
            <section className="learner-discovery" role="status" aria-live="polite">
              <h2>Skunkie is preparing your learning space</h2>
              <p>Checking for existing preferences on your Academy account.</p>
            </section>
          )}
          {view === "dashboard" && adaptivePilot && learnerReady &&
            (!learnerPreferences || learnerEditing) && !learnerSkipped && (
            <LearnerDiscovery key={accountId + ":" + (learnerEditing ? "edit" : "new")}
              name={displayName}
              initial={learnerPreferences}
              editing={learnerEditing}
              rememberByDefault={cloudSyncedAccountId === accountId}
              busy={learnerBusy}
              onSave={saveLearnerPreferences}
              onSkip={() => { if (learnerEditing) setLearnerEditing(false); else setLearnerSkipped(true); }} />
          )}
          {view === "dashboard" && adaptivePilot && learnerReady && learnerPreferences &&
            !learnerEditing && !learnerSkipped && (
            <PersonalisedLearningOverview
              preferences={learnerPreferences}
              courses={[]}
              syncNotice={learnerNotice}
              onEdit={() => setLearnerEditing(true)}
              onReset={() => void resetLearnerPreferences()}
              onNavigate={next => setView(next === "learning" ? "browse" : next)} />
          )}
          {view === "dashboard" && (!adaptivePilot || learnerSkipped) && (
            <section className="student-view student-dashboard-view" aria-label="Student dashboard">
              <div className="student-hero-card">
                <div>
                  <p className="student-kicker">Your study plan</p>
                  <h2>Small, consistent sessions build real confidence.</h2>
                  <p>Continue where you left off, reserve a class, or ask Skunkie to make today’s study plan.</p>
                  <div className="student-action-row">
                    <button type="button" onClick={() => setView("learning")}>My learning</button>
                    <button type="button" className="student-secondary-action" onClick={() => setView("companion")}>Ask Skunkie</button>
                  </div>
                </div>
                <div className="student-progress-summary" aria-label={`${registrations.length} class registrations`}>
                  <strong>{registrations.length}</strong><span>class registrations</span>
                </div>
              </div>
              <div className="student-stat-grid">
                <Stat value={registrations.length} label="Class registrations" />

              </div>
              <div className="student-two-column">
                <article className="student-panel">
                  <div className="student-panel-heading"><div><p className="student-kicker">Course discovery</p><h2>Find a course by subject and level</h2></div><button type="button" className="student-text-button" onClick={() => setView("browse")}>Browse courses</button></div>
                  <p>Explore the published Academy catalogue and review registration options on each course overview.</p>
                  <span className="student-muted">Your enrolled courses and recorded progress appear in My learning.</span>
                </article>
                <article className="student-panel student-next-class">
                  <div className="student-panel-heading"><div><p className="student-kicker">Classes</p><h2>{services.classes !== "available" ? "Class schedule unavailable" : nextClass?.title ?? "No class scheduled"}</h2></div><button type="button" className="student-text-button" onClick={() => setView("classes")}>View classes</button></div>
                  <p>{services.classes !== "available" ? "Class data could not be retrieved. Use Retry services above." : nextClass ? `${nextClass.schedule} · ${nextClass.modality}` : "Register for an upcoming study group or live session."}</p>
                  <span className="student-muted">{nextClass ? `${nextClass.enrolled}/${nextClass.seats} seats reserved` : "Your schedule is clear."}</span>
                </article>
              </div>
            </section>
          )}

          {view === "assessment" && <LearnerAssessmentWorkspace />}
          {view === "idr" && <IndividualRoadmapWorkspace />}
          {view === "lms" && <LmsWorkspace key={"lms:" + accountId} mode="student" query={query} />}

          {view === "learning" && <LmsWorkspace key={"learning:" + accountId} mode="student" scope="enrolled" query={query} onBrowseCourses={() => setView("browse")} />}
          {view === "browse" && <CourseDiscovery key={accountId} accountId={accountId} query={query} onQueryChange={setQuery} onMyLearning={() => setView("learning")} onLms={() => setView("lms")} />}

          {view === "classes" && (
            <section className="student-view" aria-label="Classes">
              <div className="student-section-heading"><div><p className="student-kicker">Live learning</p><h2>Classes and study sessions</h2><p>Register for a session and it will appear in your personal schedule.</p></div></div>
              <div className="student-session-list">
                {classes.map((classItem) => {
                  const registration = registrationByClass.get(classItem.id);
                  const action = classRegistrationAction(classItem, registration, registrationBusyClassId === classItem.id);
                  const expanded = expandedRegistrationClassId === classItem.id;
                  const detailId = `student-class-registration-${classItem.id}`;
                  return (
                    <article className="student-session-card" key={classItem.id}>
                      <div className="student-session-date"><strong>{classItem.schedule}</strong><span>{classItem.modality}</span></div>
                      <div><span className="student-status">{classItem.status}</span><h2>{classItem.title}</h2><p>{classItem.courseTitle} · {classItem.instructor}</p><small>{classItem.enrolled}/{classItem.seats} places reserved</small></div>
                      <button
                        type="button"
                        disabled={action.disabled || Boolean(registrationBusyClassId && registrationBusyClassId !== classItem.id)}
                        aria-busy={registrationBusyClassId === classItem.id}
                        aria-expanded={action.kind === "details" ? expanded : undefined}
                        aria-controls={action.kind === "details" ? detailId : undefined}
                        onClick={() => {
                          if (action.kind === "details") {
                            setExpandedRegistrationClassId(expanded ? null : classItem.id);
                          } else if (action.kind === "register") {
                            setExpandedRegistrationClassId(null);
                            void onRegister(classItem.id);
                          }
                        }}
                      >{action.label}</button>
                      {registrationFeedback?.classId === classItem.id && (
                        <p role={registrationFeedback.type === "error" ? "alert" : "status"} className={`student-registration-feedback ${registrationFeedback.type}`}>
                          {registrationFeedback.message}
                        </p>
                      )}
                      {registration && expanded && (
                        <div id={detailId} className="student-registration-details">
                          <strong>{registration.status === "Waitlisted" ? "You are on the waitlist" : "Your place is registered"}</strong>
                          <p>{registration.classTitle} · {registration.courseTitle}</p>
                          <small>Recorded: {registration.registeredAt || "Date unavailable"}</small>
                        </div>
                      )}
                    </article>
                  );
                })}
                {classes.length === 0 && <div className="student-empty-state"><div>
                  <h2>{services.classes === "available" ? "No scheduled classes" : "Class schedule unavailable"}</h2>
                  <p>{services.classes === "available" ? "New sessions will appear here when published." : "Live classes could not be retrieved. Try loading Academy services again."}</p>
                </div></div>}
              </div>
            </section>
          )}

          {view === "achievements" && <Achievements registrationCount={registrations.length} onViewLearning={() => setView("learning")} />}
          {view === "resources" && <Resources query={query} />}
          {view === "messages" && <Messages />}
          {view === "career" && <CareerResources profileHref="/?account=profile" />}
          {view === "companion" && <SkunkieOrchestrationPanel key={accountId} onAssess={() => setView("assessment")} onCourses={() => setView("browse")} />}
          {view === "profile" && <ProfileSettings displayName={displayName} portalProfile={portalProfile} registrations={registrations.length} />}
        </main>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return <article className="student-stat"><strong>{value}</strong><span>{label}</span></article>;
}

function Achievements({ registrationCount, onViewLearning }: { registrationCount: number; onViewLearning: () => void }) {
  return <section className="student-view" aria-label="Achievements"><div className="student-section-heading"><div><p className="student-kicker">Your milestones</p><h2>Achievements and credentials</h2><p>Verified certificates and badges will appear here as you complete Academy learning.</p></div></div><div className="student-achievement-grid"><Achievement icon="✦" title="Learning journey" detail="View your enrolled courses and recorded lesson activity in My learning." /><Achievement icon="◫" title="Class commitment" detail={registrationCount ? `${registrationCount} registered session${registrationCount === 1 ? "" : "s"}.` : "Register for a study session to get started."} /><Achievement icon="◌" title="Credential pathway" detail="Complete a pathway to unlock shareable evidence of learning." /></div><article className="student-empty-state"><span>✦</span><div><h2>Your next achievement is close</h2><p>Complete a course module and return here to see your learning milestones grow.</p></div><button type="button" onClick={onViewLearning}>View learning</button></article></section>;
}

function Achievement({ icon, title, detail }: { icon: string; title: string; detail: string }) { return <article className="student-achievement"><span aria-hidden="true">{icon}</span><h2>{title}</h2><p>{detail}</p></article>; }

function Resources({ query }: { query: string }) {
  const matches = (value: string) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const matchingResources = resources.filter(resource => matches(`${resource.title} ${resource.type} ${resource.detail}`));
  const matchingServices = linkedAcademyServices().filter(service => matches(`${service.name} ${service.area} ${service.summary}`));
  return <section className="student-view" aria-label="Resources">
    <div className="student-section-heading"><div><p className="student-kicker">Study support</p><h2>Resources worth saving</h2><p>Labs, notes and learning links that support your active courses.</p></div></div>
    <p role="status">{matchingResources.length + matchingServices.length} matching resources</p>
    <div className="student-resource-list">{matchingResources.map((resource) => <a key={resource.title} href={resource.href} className="student-resource-card"><span>{resource.type}</span><div><h2>{resource.title}</h2><p>{resource.detail}</p></div><strong aria-hidden="true">→</strong></a>)}</div>
    <div className="student-section-heading"><div><p className="student-kicker">Connected Academy ecosystem</p><h2>Continue across Academy services</h2><p>These links open dedicated services. Account permissions, enrolments and product licences govern access.</p></div></div>
    <div className="student-resource-list">{matchingServices.map((service) => <a key={service.id} href={service.href!} className="student-resource-card" target="_blank" rel="noopener noreferrer"><span>{service.area}</span><div><h2>{service.name}</h2><p>{service.summary}</p></div><strong aria-hidden="true">↗</strong></a>)}</div>
    {matchingResources.length + matchingServices.length === 0 && <p>No resources match your search.</p>}
    <div className="student-empty-state"><div><h2>Academy community integration</h2><p>Peer discussion, mentorship and study groups are planned. Community access will appear after an authenticated service is connected.</p></div></div>
  </section>;
}

function Messages() {
  return <section className="student-view" aria-label="Messages">
    <div className="student-section-heading"><div><p className="student-kicker">Academy messages</p><h2>Your messages</h2></div></div>
    <div className="student-empty-state"><div><h2>No messages yet</h2><p>Your Academy notifications will appear once messaging is connected. No example messages are shown.</p></div></div>
  </section>;
}

function Companion() {
  return <section className="student-view student-companion-view" aria-label="AI Learning Companion">
    <div className="student-companion-header"><div className="student-skunkie-avatar" aria-hidden="true"><img src={SKUNKIE_AVATAR_SRC} alt="" width="64" height="64" /></div><div><p className="student-kicker">AI Learning Companion</p><h2>Ask Skunkie</h2><span>Use the floating Skunkie chat button to connect to the authenticated Academy assistant.</span></div></div>
    <p>Skunkie opens from the chat button in the corner of the screen. Chat responses are delivered by the live Academy service, not generated placeholders.</p>
  </section>;
}

function ProfileSettings({ displayName, portalProfile, registrations }: { displayName: string; portalProfile: PortalProfileInput; registrations: number }) {
  return <section className="student-view" aria-label="Profile and settings">
    <div className="student-section-heading"><div><p className="student-kicker">Your account</p><h2>Profile and settings</h2><p>Your saved Academy profile and active registrations.</p></div></div>
    <div className="student-profile-grid"><article className="student-profile-card"><span className="student-avatar large" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span><h2>{displayName}</h2><p>{portalProfile.location || "Location not provided"} · Student</p><dl><div><dt>Registrations</dt><dd>{registrations}</dd></div></dl></article>
      <article className="student-settings-card"><h2>Account privacy</h2><p>Microsoft manages sign-in and authentication. Personal learning preferences will appear here when supported by the Academy account service.</p><a href="https://www.skunkworksacademy.com/privacystatement" target="_blank" rel="noopener noreferrer">Read privacy statement</a></article>
    </div>
  </section>;
}

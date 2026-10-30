import { useEffect, useMemo, useRef, useState } from "react";
import type { ApplicationRecord, ClassSession, CourseRecord, JobPosting, PortalProfile, PortalRole, UserProfile } from "./types";
import { linkedAcademyServices } from "./academy-service-registry";
import "./academy-workspace.css";

type View = "overview" | "courses" | "classes" | "recruitment" | "applications" | "people" | "documents" | "teams" | "finance" | "settings";
type NavItem = { id: View; label: string; group: string; icon: string; detail: string; staffOnly?: boolean };
type Props = {
  profile: UserProfile;
  role: PortalRole;
  courses: CourseRecord[];
  classes: ClassSession[];
  jobs: JobPosting[];
  applications: ApplicationRecord[];
  people: PortalProfile[];
  onManage: () => void;
  onSignOut: () => void;
};

export const ACADEMY_SHAREPOINT_URL = "https://bluemix944.sharepoint.com/sites/Academy";
const NAV: NavItem[] = [
  { id: "overview", label: "Dashboard", group: "WORKSPACE", icon: "▦", detail: "Academy operational overview" },
  { id: "courses", label: "Courses & catalogues", group: "LEARNING DELIVERY", icon: "▤", detail: "Training catalogue and publishing" },
  { id: "classes", label: "Cohorts & scheduling", group: "LEARNING DELIVERY", icon: "▦", detail: "Instructor-led training and cohorts" },
  { id: "recruitment", label: "Instructor opportunities", group: "PEOPLE", icon: "✧", detail: "Recruitment and instructor applications" },
  { id: "applications", label: "Applications", group: "PEOPLE", icon: "◉", detail: "Application and onboarding records" },
  { id: "people", label: "People & profiles", group: "PEOPLE", icon: "◌", detail: "Staff and instructor directory", staffOnly: true },
  { id: "documents", label: "SharePoint documents", group: "MICROSOFT 365", icon: "▧", detail: "Academy site and controlled files" },
  { id: "teams", label: "Microsoft Teams", group: "MICROSOFT 365", icon: "▣", detail: "Collaboration, classes and meetings" },
  { id: "finance", label: "Finance & reporting", group: "OPERATIONS", icon: "≡", detail: "Financial integrations and reporting", staffOnly: true },
  { id: "settings", label: "Account & access", group: "ACCOUNT", icon: "⚙", detail: "Identity, roles, security and support" }
];

export function getVisibleAcademyNavigation(isStaff: boolean) {
  return NAV.filter((item) => !item.staffOnly || isStaff);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((v) => v[0]?.toUpperCase() ?? "").join("");
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="aw-empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="aw-action secondary" href={href} target="_blank" rel="noopener noreferrer">{children} <span aria-hidden="true">↗</span></a>;
}

export function AcademyWorkspace({ profile, role, courses, classes, jobs, applications, people, onManage, onSignOut }: Props) {
  const isStaff = profile.isAdmin && role === "Staff";
  const nav = useMemo(() => getVisibleAcademyNavigation(isStaff), [isStaff]);
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = nav.filter((item) => `${item.label} ${item.detail} ${item.group}`.toLowerCase().includes(search.trim().toLowerCase()));
  const current = nav.find((item) => item.id === view) ?? nav[0];

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") { setMenuOpen(false); searchRef.current?.blur(); }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  const openView = (next: View) => { setView(next); setMenuOpen(false); setSearch(""); };
  const shownCourses = courses.filter((item) => `${item.title} ${item.level}`.toLowerCase().includes(search.toLowerCase()));
  const shownClasses = classes.filter((item) => `${item.title} ${item.courseTitle}`.toLowerCase().includes(search.toLowerCase()));
  const shownJobs = jobs.filter((item) => `${item.title} ${item.programme}`.toLowerCase().includes(search.toLowerCase()));
  const shownApps = applications.filter((item) => `${item.jobTitle} ${item.applicantName} ${item.status}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="aw-shell">
      <a href="#aw-main" className="skip-link">Skip to workspace</a>
      {menuOpen && <button className="aw-overlay" onClick={() => setMenuOpen(false)} type="button" aria-label="Close navigation" />}
      <aside className={menuOpen ? "aw-sidebar is-open" : "aw-sidebar"} aria-label="Academy workspace navigation">
        <a href="https://www.skunkworksacademy.com/" className="aw-brand">
          <img src="https://www.skunkworksacademy.com/images/favicon-white.png" alt="" width="42" height="42" />
          <span><strong>SKUNKWORKS</strong><small>ACADEMY / PORTAL</small></span>
        </a>
        <div className="aw-org"><span className="aw-dot" /> Microsoft-connected workspace</div>
        <nav className="aw-nav" aria-label="Workspace modules">
          {[...new Set(nav.map((item) => item.group))].map((group) => {
            const items = visible.filter((item) => item.group === group);
            if (!items.length) return null;
            return <div className="aw-nav-group" key={group}>
              <p>{group}</p>
              {items.map((item) => <button key={item.id} type="button" className={view === item.id ? "aw-nav-link is-active" : "aw-nav-link"} aria-current={view === item.id ? "page" : undefined} onClick={() => openView(item.id)}><span aria-hidden="true" className="aw-nav-icon">{item.icon}</span><span>{item.label}</span></button>)}
            </div>;
          })}
        </nav>
        <div className="aw-sidebar-end">
          <button type="button" className="aw-account" onClick={() => openView("settings")}>
            <span className="aw-avatar">{initials(profile.name)}</span>
            <span><strong>{profile.name}</strong><small>{role} · Microsoft Entra</small></span>
          </button>
          <button type="button" onClick={onSignOut} className="aw-sidebar-signout">Sign out</button>
        </div>
      </aside>

      <div className="aw-content">
        <header className="aw-topbar">
          <div className="aw-topbar-leading">
            <button className="aw-menu-button" type="button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label="Toggle workspace navigation">☰</button>
            <div><p className="aw-overline">SKUNKWORKS ACADEMY / {role.toUpperCase()}</p><h1>{current.label}</h1></div>
          </div>
          <div className="aw-topbar-actions">
            <label className="aw-search"><span aria-hidden="true">⌕</span><input ref={searchRef} aria-label="Search workspace navigation and records" placeholder="Search workspace…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘K</kbd></label>
            <button className="aw-topbar-avatar" type="button" onClick={() => openView("settings")} aria-label="Account and access">{initials(profile.name)}</button>
          </div>
        </header>

        <main className="aw-main" id="aw-main">
          {search.trim() && view === "overview" && <section className="aw-panel"><div className="aw-section-title"><h2>Quick navigation matches</h2><span>{visible.length} matches</span></div><div className="aw-quicklinks">{visible.map((item) => <button type="button" key={item.id} onClick={() => openView(item.id)}>{item.label}<span>→</span></button>)}</div>{!visible.length && <EmptyState title="No matches" detail="Try a course, people, document or operations keyword." />}</section>}
          {view === "overview" && <>
            <section className="aw-welcome">
              <div><p className="aw-overline">ACADEMY OPERATIONS / SECURE WORKSPACE</p><h2>Welcome back, {profile.name.split(" ")[0]}.</h2><p>Your central workspace for training delivery, people, Microsoft 365 and Academy operations. Access is determined by your Microsoft Entra role.</p><div className="aw-button-row"><button className="aw-action" type="button" onClick={() => openView("classes")}>View cohorts <span aria-hidden="true">→</span></button><ExternalLink href={ACADEMY_SHAREPOINT_URL}>Open SharePoint</ExternalLink></div></div>
              <div className="aw-hero-mark" aria-hidden="true"><span>SKUNKWORKS</span><strong>ACADEMY</strong><small>LEARN · BUILD · DEPLOY</small></div>
            </section>
            <section className="aw-stat-grid" aria-label="Workspace summary">
              <article><span>Catalogue records</span><strong>{courses.length}</strong><small>Listed in portal</small></article>
              <article><span>Class records</span><strong>{classes.length}</strong><small>Available for scheduling</small></article>
              <article><span>Instructor opportunities</span><strong>{jobs.length}</strong><small>Portal listings</small></article>
              <article><span>{isStaff ? "Applications" : "My applications"}</span><strong>{applications.length}</strong><small>Records available to your role</small></article>
            </section>
            <section className="aw-panel"><div className="aw-section-title"><div><p className="aw-overline">QUICK ACCESS</p><h2>Your Academy tools</h2></div><span>Role-aware navigation</span></div><div className="aw-tool-grid">
              {nav.filter((i) => i.id !== "overview" && i.id !== "settings").map((item) => <button className="aw-tool" key={item.id} type="button" onClick={() => openView(item.id)}><span className="aw-tool-icon">{item.icon}</span><strong>{item.label}</strong><small>{item.detail}</small><span className="aw-tool-arrow" aria-hidden="true">↗</span></button>)}
            </div></section>
            <section className="aw-panel" aria-label="Connected Academy services"><div className="aw-section-title"><div><p className="aw-overline">SITE-AWARE ACADEMY</p><h2>Connected learning and career destinations</h2></div><span>Access governed by each service</span></div><div className="aw-record-list">{linkedAcademyServices().map((service) => <article key={service.id}><div><span className="aw-record-tag">{service.area}</span><h3>{service.name}</h3><p>{service.summary}</p></div><a href={service.href!} target="_blank" rel="noopener noreferrer" aria-label={`Open ${service.name} in a new tab`}>Open ↗</a></article>)}</div><p className="aw-muted-note">A configured link is not a paid entitlement, a Microsoft 365 licence or confirmation of a deployed service.</p></section>
            <section className="aw-bottom-grid"><article className="aw-panel"><p className="aw-overline">MICROSOFT 365</p><h2>Connected services</h2><p>Use your Academy Microsoft identity to access Teams and authorised SharePoint resources. Individual document permissions remain enforced by Microsoft 365.</p><div className="aw-button-row"><ExternalLink href={ACADEMY_SHAREPOINT_URL}>SharePoint</ExternalLink><ExternalLink href="https://teams.microsoft.com/">Microsoft Teams</ExternalLink></div></article><article className="aw-panel"><p className="aw-overline">MANAGEMENT TOOLS</p><h2>Existing portal workflows</h2><p>Continue to use the existing forms for authorised instructor applications, job postings, class scheduling and profile updates.</p><button type="button" className="aw-action" onClick={onManage}>Open management tools <span aria-hidden="true">→</span></button></article></section>
          </>}

          {view === "courses" && <section className="aw-panel"><div className="aw-section-title"><div><p className="aw-overline">LEARNING DELIVERY</p><h2>Course catalogue</h2></div><button type="button" className="aw-action" onClick={onManage}>Manage catalogue</button></div><div className="aw-record-list">{shownCourses.map((item) => <article key={item.id}><div><span className="aw-record-tag">{item.status}</span><h3>{item.title}</h3><p>{item.level} · {item.duration}</p></div><span>{item.id}</span></article>)}</div>{!shownCourses.length && <EmptyState title="No course records" detail="No courses match your search. Authorised catalogue management is available in the existing portal." />}</section>}

          {view === "classes" && <section className="aw-panel"><div className="aw-section-title"><div><p className="aw-overline">LEARNING DELIVERY</p><h2>Cohorts and scheduling</h2></div><button type="button" className="aw-action" onClick={onManage}>Manage schedules</button></div><div className="aw-record-list">{shownClasses.map((item) => <article key={item.id}><div><span className="aw-record-tag">{item.status}</span><h3>{item.title}</h3><p>{item.schedule} · {item.modality} · {item.instructor || "Instructor not assigned"}</p></div><span>{item.enrolled} / {item.seats} seats</span></article>)}</div>{!shownClasses.length && <EmptyState title="No cohorts listed" detail="There are no matching scheduled classes. Use the management tools to administer authorised schedules." />}</section>}

          {view === "recruitment" && <section className="aw-panel"><div className="aw-section-title"><div><p className="aw-overline">PEOPLE</p><h2>Instructor opportunities</h2></div><button type="button" className="aw-action" onClick={onManage}>{isStaff ? "Manage postings" : "Apply for a role"}</button></div><div className="aw-record-list">{shownJobs.map((item) => <article key={item.id}><div><span className="aw-record-tag">{item.status}</span><h3>{item.title}</h3><p>{item.programme} · {item.modality}</p></div><span>{item.rateBand || "Rate pending"}</span></article>)}</div>{!shownJobs.length && <EmptyState title="No opportunities listed" detail="No matching instructor opportunities are currently available in this view." />}</section>}

          {view === "applications" && <section className="aw-panel"><div className="aw-section-title"><div><p className="aw-overline">PEOPLE</p><h2>{isStaff ? "Instructor applications" : "My applications"}</h2></div><button type="button" className="aw-action" onClick={onManage}>Open application tools</button></div><div className="aw-record-list">{shownApps.map((item) => <article key={item.id}><div><span className="aw-record-tag">{item.status}</span><h3>{item.jobTitle}</h3><p>{isStaff ? item.applicantName + " · " : ""}{item.submittedAt || "Date unavailable"}</p></div><span>{item.owner || "Unassigned"}</span></article>)}</div>{!shownApps.length && <EmptyState title="No applications" detail="Applications will appear once they have been submitted and authorised for your role." />}</section>}

          {view === "people" && isStaff && <section className="aw-panel"><div className="aw-section-title"><div><p className="aw-overline">PEOPLE</p><h2>Profiles and directory</h2></div><button type="button" className="aw-action" onClick={onManage}>Manage profiles</button></div><div className="aw-record-list">{people.filter((p) => `${p.displayName} ${p.email}`.toLowerCase().includes(search.toLowerCase())).map((item) => <article key={item.id}><div><span className="aw-record-tag">{item.portalRole}</span><h3>{item.displayName}</h3><p>{item.email}</p></div></article>)}</div>{!people.length && <EmptyState title="No people records available" detail="Profiles are shown only after the secured portal API returns authorised records." />}</section>}

          {view === "documents" && <section className="aw-panel"><p className="aw-overline">MICROSOFT SHAREPOINT</p><h2>Academy documents</h2><p>Open the verified Skunkworks Academy SharePoint site. Files and folders are governed by your Microsoft 365 permissions, sensitivity labels and sharing policies. No documents are copied into this public frontend.</p><div className="aw-service-card"><span className="aw-service-icon">S</span><div><strong>Skunkworks Academy · SharePoint</strong><small>{ACADEMY_SHAREPOINT_URL}</small><span>Microsoft 365 authentication required</span></div></div><div className="aw-button-row"><ExternalLink href={ACADEMY_SHAREPOINT_URL}>Open document library</ExternalLink></div><p className="aw-muted-note">Document search inside this portal will require a protected backend using Microsoft Graph and scoped site permissions.</p></section>}

          {view === "teams" && <section className="aw-panel"><p className="aw-overline">MICROSOFT TEAMS</p><h2>Classes and collaboration</h2><p>Launch Microsoft Teams with your signed-in organisational account to access meetings, learning groups and the teams you have permission to join.</p><div className="aw-button-row"><ExternalLink href="https://teams.microsoft.com/">Open Microsoft Teams</ExternalLink><button type="button" className="aw-action secondary" onClick={() => openView("classes")}>View Academy classes</button></div></section>}

          {view === "finance" && isStaff && <section className="aw-panel"><p className="aw-overline">ACADEMY OPERATIONS</p><h2>Finance and reporting</h2><EmptyState title="Financial data source not connected" detail="This module intentionally has no sample invoices, payments or revenue figures. Connect and authorise a finance service through the backend before enabling financial transactions or reports." /><p className="aw-muted-note">Recommended foundation: a server-side integration with role-based authorisation, reconciliation, approval workflow and audit logs.</p></section>}

          {view === "settings" && <section className="aw-panel"><p className="aw-overline">IDENTITY AND ACCESS</p><h2>My Microsoft account</h2><dl className="aw-details"><div><dt>Name</dt><dd>{profile.name}</dd></div><div><dt>Microsoft sign-in</dt><dd>{profile.username}</dd></div><div><dt>Workspace role</dt><dd>{role}</dd></div><div><dt>Tenant</dt><dd>{profile.tenantId ?? "Unknown"}</dd></div><div><dt>Role claims</dt><dd>{profile.roles.length ? profile.roles.join(", ") : "No app role returned"}</dd></div></dl><p className="aw-muted-note">Authentication is provided by Microsoft Entra ID. Staff-only modules require a verified tenant and the relevant application-role claim; interface controls do not grant backend permissions.</p><div className="aw-button-row"><button type="button" className="aw-action" onClick={onManage}>Open existing account tools</button><button type="button" className="aw-action secondary" onClick={onSignOut}>Sign out of Microsoft</button><ExternalLink href="mailto:training@skunkworks.africa">Contact support</ExternalLink></div></section>}

          <footer className="aw-footer"><span>© Skunkworks Academy · Secure operational workspace</span><span>Microsoft Entra ID · SharePoint · Role-based access</span><a href="https://www.skunkworksacademy.com/">Academy website</a></footer>
        </main>
      </div>
    </div>
  );
}

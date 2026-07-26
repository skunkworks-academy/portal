const STAFF_ACCOUNT_STYLE_ID = "staff-account-navigation-styles";
const STAFF_ACCOUNT_NAV_ID = "staff-account-sidebar-shell";

const staffAccountNavItems = [
  { id: "staff-dashboard", label: "Dashboard", icon: "📌" },
  { id: "staff-operations", label: "Operations", icon: "⚙️" },
  { id: "staff-jobs", label: "Jobs", icon: "💼" },
  { id: "staff-applications", label: "Applications", icon: "📨" },
  { id: "staff-instructors", label: "Instructors", icon: "🧑‍🏫" },
  { id: "staff-students", label: "Students", icon: "🎓" },
  { id: "staff-scheduling", label: "Scheduling", icon: "🗓️" },
  { id: "staff-resources", label: "Resources", icon: "📚" },
  { id: "staff-settings", label: "Settings", icon: "🔐" },
  { id: "staff-reports", label: "Reports", icon: "📊" }
] as const;

const staffGeneratedSections = [
  {
    id: "staff-applications",
    icon: "📨",
    eyebrow: "Applications",
    title: "Application review queue",
    detail: "Track instructor applications, ownership, review status and approval hand-off from one staff queue.",
    cards: ["New submissions", "Assigned reviews", "Approved instructors"]
  },
  {
    id: "staff-instructors",
    icon: "🧑‍🏫",
    eyebrow: "Instructors",
    title: "Instructor directory",
    detail: "Manage instructor profiles, delivery disciplines, certification status, availability and onboarding readiness.",
    cards: ["Instructor profiles", "Certification status", "Availability"]
  },
  {
    id: "staff-students",
    icon: "🎓",
    eyebrow: "Students",
    title: "Student operations",
    detail: "Coordinate learner records, registrations, cohort progress, support flags and learner success interventions.",
    cards: ["Learner records", "Registration status", "Support flags"]
  },
  {
    id: "staff-resources",
    icon: "📚",
    eyebrow: "Resources",
    title: "Operational resources",
    detail: "Centralise templates, delivery packs, lab readiness documents, partner resources and policy references.",
    cards: ["Delivery packs", "Lab readiness", "Templates"]
  },
  {
    id: "staff-settings",
    icon: "🔐",
    eyebrow: "Settings",
    title: "Portal settings and access control",
    detail: "Review role mapping, Microsoft Entra readiness, API health, SharePoint provisioning and environment configuration.",
    cards: ["Role mapping", "API health", "SharePoint setup"]
  }
] as const;

function injectStaffAccountStyles() {
  if (document.getElementById(STAFF_ACCOUNT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STAFF_ACCOUNT_STYLE_ID;
  style.textContent = `
    .staff-account-sidebar-shell {
      display: grid;
      grid-template-columns: minmax(230px, 290px) minmax(0, 1fr);
      gap: 1.5rem;
      align-items: start;
      margin: 1.5rem 0;
    }

    .staff-account-sidebar-card,
    .staff-command-centre,
    .staff-generated-section {
      border: 1px solid var(--academy-line);
      border-radius: 1.5rem;
      background: var(--academy-surface);
      box-shadow: var(--academy-shadow);
    }

    .staff-account-sidebar-card {
      position: sticky;
      top: 6rem;
      display: grid;
      gap: .35rem;
      padding: 1rem;
    }

    .staff-sidebar-title {
      margin: 0 0 .75rem;
      color: var(--academy-muted);
      font-size: .78rem;
      font-weight: 800;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .staff-account-sidebar-card a {
      display: flex;
      gap: .65rem;
      align-items: center;
      min-height: 2.85rem;
      padding: .72rem .85rem;
      border-radius: .9rem;
      color: var(--academy-text);
      text-decoration: none;
      font-weight: 800;
      transition: background 160ms ease, color 160ms ease, transform 160ms ease;
    }

    .staff-account-sidebar-card a:hover,
    .staff-account-sidebar-card a:focus-visible {
      background: color-mix(in srgb, var(--academy-accent) 16%, transparent);
      color: var(--academy-text);
      transform: translateX(2px);
      outline: none;
    }

    .staff-account-sidebar-card span[aria-hidden="true"] {
      width: 1.45rem;
      text-align: center;
    }

    .staff-command-centre {
      padding: clamp(1rem, 2vw, 1.5rem);
      overflow: hidden;
    }

    .staff-command-centre h2 {
      max-width: 860px;
      margin-top: .35rem;
    }

    .staff-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: .75rem;
      margin: 1rem 0;
    }

    .staff-kpi-grid div {
      border: 1px solid var(--academy-line);
      border-radius: 1rem;
      padding: 1rem;
      background: color-mix(in srgb, var(--academy-accent) 8%, transparent);
    }

    .staff-kpi-grid strong {
      display: block;
      font-size: clamp(1.7rem, 4vw, 2.5rem);
      line-height: 1;
    }

    .staff-kpi-grid span {
      display: block;
      margin-top: .35rem;
      color: var(--academy-muted);
      font-weight: 700;
    }

    .staff-action-grid,
    .staff-generated-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .85rem;
      margin-top: 1rem;
    }

    .staff-action-card,
    .staff-generated-card {
      border: 1px solid var(--academy-line);
      border-radius: 1rem;
      padding: 1rem;
      background: color-mix(in srgb, var(--academy-text) 5%, transparent);
      color: var(--academy-text);
      text-decoration: none;
      font-weight: 800;
    }

    .staff-action-card span,
    .staff-generated-card span {
      display: block;
      margin-top: .35rem;
      color: var(--academy-muted);
      font-size: .92rem;
      font-weight: 600;
      line-height: 1.45;
    }

    .staff-generated-section {
      scroll-margin-top: 7rem;
      padding: clamp(1rem, 2vw, 1.5rem);
      margin: 1.5rem 0;
    }

    .staff-generated-section .empty-illustration {
      width: 5.5rem;
      height: 5.5rem;
      display: grid;
      place-items: center;
      margin-bottom: 1rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--academy-accent) 16%, transparent);
      font-size: 2rem;
    }

    #staff-dashboard,
    #staff-operations,
    #staff-jobs,
    #staff-applications,
    #staff-instructors,
    #staff-students,
    #staff-scheduling,
    #staff-resources,
    #staff-settings,
    #staff-reports {
      scroll-margin-top: 7rem;
    }

    @media (max-width: 1080px) {
      .staff-account-sidebar-shell {
        grid-template-columns: 1fr;
      }

      .staff-account-sidebar-card {
        position: static;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .staff-sidebar-title {
        grid-column: 1 / -1;
      }

      .staff-kpi-grid,
      .staff-action-grid,
      .staff-generated-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 620px) {
      .staff-account-sidebar-card,
      .staff-kpi-grid,
      .staff-action-grid,
      .staff-generated-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}

function hasStaffRoleSelected() {
  return Array.from(document.querySelectorAll<HTMLElement>(".role-entry.selected")).some((entry) =>
    entry.textContent?.toLowerCase().includes("staff")
  );
}

function findStaffPanelByHeading(heading: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".command-panel h2"))
    .find((element) => element.textContent?.trim().toLowerCase() === heading.toLowerCase())
    ?.closest<HTMLElement>(".command-panel") ?? null;
}

function setStaffSectionId(element: HTMLElement | null, id: string) {
  if (!element) return;
  element.id = id;
  element.classList.add("staff-account-section");
}

function textForStaffMetric(selector: string) {
  return document.querySelector<HTMLElement>(selector)?.textContent?.trim() || "—";
}

function staffRecordCount(selector: string) {
  return document.querySelectorAll(selector).length;
}

function ensureStaffShell(main: HTMLElement) {
  if (document.getElementById(STAFF_ACCOUNT_NAV_ID)) return;

  const workspaceGrid = main.querySelector<HTMLElement>(".workspace-grid");
  const jobCards = staffRecordCount("#staff-jobs .card") || "—";
  const classCards = staffRecordCount("#staff-scheduling .card") || "—";
  const applicationRecords = staffRecordCount("#staff-operations .record-list article");
  const currentAccess = textForStaffMetric(".section-head.full-span span");

  const shell = document.createElement("section");
  shell.id = STAFF_ACCOUNT_NAV_ID;
  shell.className = "staff-account-sidebar-shell";
  shell.setAttribute("aria-label", "Staff account navigation");
  shell.innerHTML = `
    <aside class="staff-account-sidebar-card">
      <p class="staff-sidebar-title">Staff Workspace</p>
      ${staffAccountNavItems
        .map((item) => `<a href="#${item.id}"><span aria-hidden="true">${item.icon}</span>${item.label}</a>`)
        .join("")}
    </aside>
    <article id="staff-dashboard" class="staff-command-centre">
      <p class="eyebrow">Staff command centre</p>
      <h2>Operate the Academy portal across jobs, applications, instructors, students, scheduling, resources, settings and reports.</h2>
      <p>${currentAccess}</p>
      <div class="staff-kpi-grid" aria-label="Staff workspace summary">
        <div><strong>${jobCards}</strong><span>Job cards</span></div>
        <div><strong>${classCards}</strong><span>Class cards</span></div>
        <div><strong>${applicationRecords}</strong><span>Loaded records</span></div>
        <div><strong>10</strong><span>Workspace areas</span></div>
      </div>
      <div class="staff-action-grid">
        <a class="staff-action-card" href="#staff-operations">Create operations<span>Publish jobs and class schedules from the control surface.</span></a>
        <a class="staff-action-card" href="#staff-applications">Review applications<span>Track instructor applicants and ownership.</span></a>
        <a class="staff-action-card" href="#staff-reports">View reports<span>Monitor portal readiness and delivery activity.</span></a>
      </div>
    </article>
  `;

  workspaceGrid?.insertAdjacentElement("afterend", shell);
}

function ensureStaffGeneratedSection(main: HTMLElement, section: (typeof staffGeneratedSections)[number]) {
  if (document.getElementById(section.id)) return;

  const element = document.createElement("section");
  element.id = section.id;
  element.className = "staff-generated-section";
  element.innerHTML = `
    <div class="empty-illustration" aria-hidden="true">${section.icon}</div>
    <p class="eyebrow">${section.eyebrow}</p>
    <h2>${section.title}</h2>
    <p>${section.detail}</p>
    <div class="staff-generated-grid">
      ${section.cards.map((card) => `<div class="staff-generated-card">${card}<span>Ready for Microsoft Graph and SharePoint-backed workflow data.</span></div>`).join("")}
    </div>
  `;

  main.append(element);
}

function ensureStaffReportsSection(main: HTMLElement) {
  if (document.getElementById("staff-reports")) return;

  const jobs = staffRecordCount("#staff-jobs .card") || "—";
  const classes = staffRecordCount("#staff-scheduling .card") || "—";
  const operationsRecords = staffRecordCount("#staff-operations .record-list article");

  const element = document.createElement("section");
  element.id = "staff-reports";
  element.className = "staff-generated-section";
  element.innerHTML = `
    <div class="empty-illustration" aria-hidden="true">📊</div>
    <p class="eyebrow">Reports</p>
    <h2>Staff operations reports</h2>
    <p>Reporting combines portal health, application queues, job postings, class scheduling, instructor records and learner operations into one staff view.</p>
    <div class="staff-kpi-grid" aria-label="Staff report summary">
      <div><strong>${jobs}</strong><span>Job cards</span></div>
      <div><strong>${classes}</strong><span>Class cards</span></div>
      <div><strong>${operationsRecords}</strong><span>Operation records</span></div>
      <div><strong>0</strong><span>Critical alerts</span></div>
    </div>
  `;

  main.append(element);
}

function removeStaffAccountEnhancement(main: HTMLElement) {
  main.classList.remove("staff-account-enabled");
  document.getElementById(STAFF_ACCOUNT_NAV_ID)?.remove();
  document.querySelectorAll(".staff-generated-section").forEach((section) => section.remove());
}

function enhanceStaffAccountNavigation() {
  const main = document.querySelector<HTMLElement>(".portal-main");
  if (!main) return;

  if (!hasStaffRoleSelected()) {
    removeStaffAccountEnhancement(main);
    return;
  }

  injectStaffAccountStyles();
  main.classList.add("staff-account-enabled");

  setStaffSectionId(findStaffPanelByHeading("Admin control surface"), "staff-operations");
  setStaffSectionId(findStaffPanelByHeading("Open roles"), "staff-jobs");
  setStaffSectionId(document.querySelector<HTMLElement>('section.content-grid[aria-label="Courses and classes"]'), "staff-scheduling");
  setStaffSectionId(findStaffPanelByHeading("Microsoft Entra connection"), "staff-settings");

  staffGeneratedSections.forEach((section) => ensureStaffGeneratedSection(main, section));
  ensureStaffReportsSection(main);
  ensureStaffShell(main);
}

let nextFrame = 0;
function scheduleStaffAccountNavigation() {
  cancelAnimationFrame(nextFrame);
  nextFrame = requestAnimationFrame(enhanceStaffAccountNavigation);
}

if (typeof window !== "undefined") {
  window.addEventListener("load", scheduleStaffAccountNavigation);
  document.addEventListener("click", () => setTimeout(scheduleStaffAccountNavigation, 0));

  const observer = new MutationObserver(scheduleStaffAccountNavigation);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleStaffAccountNavigation();
}

export {};

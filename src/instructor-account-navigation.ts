const INSTRUCTOR_ACCOUNT_STYLE_ID = "instructor-account-navigation-styles";
const INSTRUCTOR_ACCOUNT_NAV_ID = "instructor-account-sidebar-shell";

const instructorAccountNavItems = [
  { id: "instructor-dashboard", label: "Dashboard", icon: "📌" },
  { id: "instructor-profile", label: "Instructor Profile", icon: "👤" },
  { id: "instructor-classes", label: "My Classes", icon: "🗓️" },
  { id: "instructor-applications", label: "My Applications", icon: "📨" },
  { id: "instructor-jobs", label: "Jobs", icon: "💼" },
  { id: "instructor-learners", label: "Learners", icon: "👥" },
  { id: "instructor-materials", label: "Course Materials", icon: "📚" },
  { id: "instructor-assessments", label: "Assessments", icon: "✅" },
  { id: "instructor-reports", label: "Reports", icon: "📊" }
] as const;

const instructorGeneratedSections = [
  {
    id: "instructor-learners",
    icon: "👥",
    eyebrow: "Learners",
    title: "Learner cohorts",
    detail: "View learner cohorts, attendance risk, progress notes and intervention follow-ups once class roster data is connected.",
    cards: ["Active cohorts", "Attendance risk", "Learner notes"]
  },
  {
    id: "instructor-materials",
    icon: "📚",
    eyebrow: "Course Materials",
    title: "Teaching resources and lab assets",
    detail: "Instructor packs, slide decks, labs, rubrics, handouts and delivery guides will be organised here.",
    cards: ["Instructor guides", "Lab environments", "Slide decks"]
  },
  {
    id: "instructor-assessments",
    icon: "✅",
    eyebrow: "Assessments",
    title: "Assessments and grading",
    detail: "Build assessments, review submissions, grade practical work and track certification readiness from this area.",
    cards: ["Knowledge checks", "Practical submissions", "Rubrics"]
  }
] as const;

function injectInstructorAccountStyles() {
  if (document.getElementById(INSTRUCTOR_ACCOUNT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = INSTRUCTOR_ACCOUNT_STYLE_ID;
  style.textContent = `
    .instructor-account-sidebar-shell {
      display: grid;
      grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
      gap: 1.5rem;
      align-items: start;
      margin: 1.5rem 0;
    }

    .instructor-account-sidebar-card,
    .instructor-account-command-centre,
    .instructor-account-generated {
      border: 1px solid var(--academy-line);
      border-radius: 1.5rem;
      background: var(--academy-surface);
      box-shadow: var(--academy-shadow);
    }

    .instructor-account-sidebar-card {
      position: sticky;
      top: 6rem;
      display: grid;
      gap: .35rem;
      padding: 1rem;
    }

    .instructor-account-sidebar-title {
      margin: 0 0 .75rem;
      color: var(--academy-muted);
      font-size: .78rem;
      font-weight: 800;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .instructor-account-sidebar-card a {
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

    .instructor-account-sidebar-card a:hover,
    .instructor-account-sidebar-card a:focus-visible {
      background: color-mix(in srgb, var(--academy-accent-2) 16%, transparent);
      color: var(--academy-text);
      transform: translateX(2px);
      outline: none;
    }

    .instructor-account-sidebar-card span[aria-hidden="true"] {
      width: 1.4rem;
      text-align: center;
    }

    .instructor-account-command-centre {
      padding: clamp(1rem, 2vw, 1.5rem);
      overflow: hidden;
    }

    .instructor-account-command-centre h2 {
      max-width: 820px;
      margin-top: .35rem;
    }

    .instructor-action-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .85rem;
      margin-top: 1rem;
    }

    .instructor-action-card,
    .instructor-account-generated-card {
      border: 1px solid var(--academy-line);
      border-radius: 1rem;
      padding: 1rem;
      background: color-mix(in srgb, var(--academy-text) 5%, transparent);
      color: var(--academy-text);
      text-decoration: none;
      font-weight: 800;
    }

    .instructor-action-card span,
    .instructor-account-generated-card span {
      display: block;
      margin-top: .35rem;
      color: var(--academy-muted);
      font-size: .92rem;
      font-weight: 600;
      line-height: 1.45;
    }

    .instructor-account-generated {
      scroll-margin-top: 7rem;
      padding: clamp(1rem, 2vw, 1.5rem);
      margin: 1.5rem 0;
    }

    .instructor-account-generated .empty-illustration {
      width: 5.5rem;
      height: 5.5rem;
      display: grid;
      place-items: center;
      margin-bottom: 1rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--academy-accent-2) 16%, transparent);
      font-size: 2rem;
    }

    .instructor-account-generated-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .75rem;
      margin-top: 1rem;
    }

    .instructor-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: .75rem;
      margin: 1rem 0;
    }

    .instructor-kpi-grid div {
      border: 1px solid var(--academy-line);
      border-radius: 1rem;
      padding: 1rem;
      background: color-mix(in srgb, var(--academy-accent-2) 8%, transparent);
    }

    .instructor-kpi-grid strong {
      display: block;
      font-size: clamp(1.7rem, 4vw, 2.5rem);
      line-height: 1;
    }

    .instructor-kpi-grid span {
      display: block;
      margin-top: .35rem;
      color: var(--academy-muted);
      font-weight: 700;
    }

    #instructor-dashboard,
    #instructor-profile,
    #instructor-classes,
    #instructor-applications,
    #instructor-jobs,
    #instructor-learners,
    #instructor-materials,
    #instructor-assessments,
    #instructor-reports {
      scroll-margin-top: 7rem;
    }

    @media (max-width: 1080px) {
      .instructor-account-sidebar-shell {
        grid-template-columns: 1fr;
      }

      .instructor-account-sidebar-card {
        position: static;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .instructor-account-sidebar-title {
        grid-column: 1 / -1;
      }

      .instructor-action-grid,
      .instructor-account-generated-grid,
      .instructor-kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 620px) {
      .instructor-account-sidebar-card,
      .instructor-action-grid,
      .instructor-account-generated-grid,
      .instructor-kpi-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}

function hasInstructorRoleSelected() {
  return Array.from(document.querySelectorAll<HTMLElement>(".role-entry.selected")).some((entry) =>
    entry.textContent?.toLowerCase().includes("instructor")
  );
}

function findInstructorPanelByHeading(heading: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".command-panel h2"))
    .find((element) => element.textContent?.trim().toLowerCase() === heading.toLowerCase())
    ?.closest<HTMLElement>(".command-panel") ?? null;
}

function setInstructorSectionId(element: HTMLElement | null, id: string) {
  if (!element) return;
  element.id = id;
  element.classList.add("instructor-account-section");
}

function metricText(selector: string) {
  return document.querySelector<HTMLElement>(selector)?.textContent?.trim() || "—";
}

function ensureInstructorShell(main: HTMLElement) {
  if (document.getElementById(INSTRUCTOR_ACCOUNT_NAV_ID)) return;

  const workspaceGrid = main.querySelector<HTMLElement>(".workspace-grid");
  const courseCards = document.querySelectorAll('section.content-grid[aria-label="Courses and classes"] .card').length || "—";
  const jobCards = document.querySelectorAll("#instructor-jobs .card").length || "—";
  const applicationCards = document.querySelectorAll("#instructor-applications .card, #instructor-applications tbody tr").length || 0;
  const currentAccess = metricText(".section-head.full-span span");

  const shell = document.createElement("section");
  shell.id = INSTRUCTOR_ACCOUNT_NAV_ID;
  shell.className = "instructor-account-sidebar-shell";
  shell.setAttribute("aria-label", "Instructor account navigation");
  shell.innerHTML = `
    <aside class="instructor-account-sidebar-card">
      <p class="instructor-account-sidebar-title">Instructor Workspace</p>
      ${instructorAccountNavItems
        .map((item) => `<a href="#${item.id}"><span aria-hidden="true">${item.icon}</span>${item.label}</a>`)
        .join("")}
    </aside>
    <article id="instructor-dashboard" class="instructor-account-command-centre">
      <p class="eyebrow">Instructor command centre</p>
      <h2>Manage delivery, applications, learner cohorts, materials, assessments and reporting from one instructor workspace.</h2>
      <p>${currentAccess}</p>
      <div class="instructor-kpi-grid" aria-label="Instructor workspace summary">
        <div><strong>${courseCards}</strong><span>Learning and class cards</span></div>
        <div><strong>${jobCards}</strong><span>Open instructor roles</span></div>
        <div><strong>${applicationCards}</strong><span>Applications / rows</span></div>
        <div><strong>9</strong><span>Workspace areas</span></div>
      </div>
      <div class="instructor-action-grid">
        <a class="instructor-action-card" href="#instructor-classes">Prepare classes<span>Review schedules, delivery mode and assigned sessions.</span></a>
        <a class="instructor-action-card" href="#instructor-materials">Open materials<span>Keep instructor packs, labs and slides aligned.</span></a>
        <a class="instructor-action-card" href="#instructor-reports">Review reports<span>Track readiness, progress and delivery status.</span></a>
      </div>
    </article>
  `;

  workspaceGrid?.insertAdjacentElement("afterend", shell);
}

function ensureInstructorGeneratedSection(main: HTMLElement, section: (typeof instructorGeneratedSections)[number]) {
  if (document.getElementById(section.id)) return;

  const element = document.createElement("section");
  element.id = section.id;
  element.className = "instructor-account-generated";
  element.innerHTML = `
    <div class="empty-illustration" aria-hidden="true">${section.icon}</div>
    <p class="eyebrow">${section.eyebrow}</p>
    <h2>${section.title}</h2>
    <p>${section.detail}</p>
    <div class="instructor-account-generated-grid">
      ${section.cards.map((card) => `<div class="instructor-account-generated-card">${card}<span>Ready for SharePoint and Graph-backed data integration.</span></div>`).join("")}
    </div>
  `;

  main.append(element);
}

function ensureInstructorReportsSection(main: HTMLElement) {
  if (document.getElementById("instructor-reports")) return;

  const classCards = document.querySelectorAll("#instructor-classes .card").length || "—";
  const applications = document.querySelectorAll("#instructor-applications .card, #instructor-applications tbody tr").length || 0;
  const jobs = document.querySelectorAll("#instructor-jobs .card").length || "—";

  const element = document.createElement("section");
  element.id = "instructor-reports";
  element.className = "instructor-account-generated";
  element.innerHTML = `
    <div class="empty-illustration" aria-hidden="true">📊</div>
    <p class="eyebrow">Reports</p>
    <h2>Instructor delivery reports</h2>
    <p>Delivery reports will combine class activity, learner progress, assessment outcomes, material readiness and instructor application status.</p>
    <div class="instructor-kpi-grid" aria-label="Instructor report summary">
      <div><strong>${classCards}</strong><span>Class cards</span></div>
      <div><strong>${applications}</strong><span>Applications</span></div>
      <div><strong>${jobs}</strong><span>Role cards</span></div>
      <div><strong>0</strong><span>Open grading items</span></div>
    </div>
  `;

  main.append(element);
}

function removeInstructorAccountEnhancement(main: HTMLElement) {
  main.classList.remove("instructor-account-enabled");
  document.getElementById(INSTRUCTOR_ACCOUNT_NAV_ID)?.remove();
  document.querySelectorAll(".instructor-account-generated").forEach((section) => section.remove());
}

function enhanceInstructorAccountNavigation() {
  const main = document.querySelector<HTMLElement>(".portal-main");
  if (!main) return;

  if (!hasInstructorRoleSelected()) {
    removeInstructorAccountEnhancement(main);
    return;
  }

  injectInstructorAccountStyles();
  main.classList.add("instructor-account-enabled");

  setInstructorSectionId(findInstructorPanelByHeading("Profile"), "instructor-profile");
  setInstructorSectionId(document.querySelector<HTMLElement>('section.content-grid[aria-label="Courses and classes"]'), "instructor-classes");
  setInstructorSectionId(findInstructorPanelByHeading("My applications"), "instructor-applications");
  setInstructorSectionId(findInstructorPanelByHeading("Open roles"), "instructor-jobs");

  instructorGeneratedSections.forEach((section) => ensureInstructorGeneratedSection(main, section));
  ensureInstructorReportsSection(main);
  ensureInstructorShell(main);
}

let nextFrame = 0;
function scheduleInstructorAccountNavigation() {
  cancelAnimationFrame(nextFrame);
  nextFrame = requestAnimationFrame(enhanceInstructorAccountNavigation);
}

if (typeof window !== "undefined") {
  window.addEventListener("load", scheduleInstructorAccountNavigation);
  document.addEventListener("click", () => setTimeout(scheduleInstructorAccountNavigation, 0));

  const observer = new MutationObserver(scheduleInstructorAccountNavigation);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleInstructorAccountNavigation();
}

export {};

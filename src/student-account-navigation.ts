const STUDENT_ACCOUNT_STYLE_ID = "student-account-navigation-styles";
const STUDENT_ACCOUNT_NAV_ID = "student-account-sidebar-shell";

const studentAccountNavItems = [
  { id: "student-personal-details", label: "Personal Details", icon: "👤" },
  { id: "student-learning", label: "Learning", icon: "🎓" },
  { id: "student-certifications", label: "Certifications", icon: "🏅" },
  { id: "student-jobs", label: "Jobs", icon: "💼" },
  { id: "student-connections", label: "Connections", icon: "🤝" },
  { id: "student-subscriptions", label: "Subscriptions", icon: "📄" },
  { id: "student-order-history", label: "Order History", icon: "🧾" },
  { id: "student-reports", label: "Reports", icon: "📊" }
] as const;

const generatedSections = [
  {
    id: "student-certifications",
    eyebrow: "Certifications",
    title: "You have no certifications yet",
    detail: "Completed Skunkworks Academy certificates, digital badges and exam milestones will appear here once they are connected to your learner profile.",
    cards: ["Badges", "Exam vouchers", "Credential pathway"]
  },
  {
    id: "student-connections",
    eyebrow: "Connections",
    title: "Mentors, instructors and members",
    detail: "Your assigned mentors, course instructors and cohort members will appear here as the learner network is enabled.",
    cards: ["Mentors", "Instructors", "Members"]
  },
  {
    id: "student-subscriptions",
    eyebrow: "Subscriptions",
    title: "You do not have any subscriptions",
    detail: "Active learning plans, renewals and subscription entitlements will appear here.",
    cards: ["Current plan", "Renewals", "Entitlements"]
  },
  {
    id: "student-order-history",
    eyebrow: "Order History",
    title: "You have no orders",
    detail: "Course purchases, invoices, exam voucher orders and subscription payments will appear here.",
    cards: ["Invoices", "Receipts", "Voucher orders"]
  }
] as const;

function injectStudentAccountStyles() {
  if (document.getElementById(STUDENT_ACCOUNT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STUDENT_ACCOUNT_STYLE_ID;
  style.textContent = `
    .student-account-sidebar-shell {
      display: grid;
      grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
      gap: 1.5rem;
      align-items: start;
      margin: 1.5rem 0;
    }

    .student-account-sidebar-card,
    .student-account-intro-card {
      border: 1px solid var(--academy-line);
      border-radius: 1.5rem;
      background: var(--academy-panel);
      box-shadow: var(--academy-shadow);
      padding: 1rem;
    }

    .student-account-sidebar-card {
      position: sticky;
      top: 6rem;
      display: grid;
      gap: .35rem;
    }

    .student-account-sidebar-title {
      margin: 0 0 .75rem;
      color: var(--academy-muted);
      font-size: .78rem;
      font-weight: 800;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .student-account-sidebar-card a {
      display: flex;
      gap: .65rem;
      align-items: center;
      min-height: 2.85rem;
      padding: .72rem .85rem;
      border-radius: .85rem;
      color: var(--academy-text);
      text-decoration: none;
      font-weight: 800;
      transition: background 160ms ease, color 160ms ease, transform 160ms ease;
    }

    .student-account-sidebar-card a:hover,
    .student-account-sidebar-card a:focus-visible {
      background: color-mix(in srgb, var(--academy-accent) 16%, transparent);
      color: var(--academy-text);
      transform: translateX(2px);
      outline: none;
    }

    .student-account-sidebar-card span[aria-hidden="true"] {
      width: 1.4rem;
      text-align: center;
    }

    .student-account-intro-card h2 {
      margin-top: .35rem;
    }

    .student-account-nav-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: .75rem;
      margin-top: 1rem;
    }

    .student-account-nav-grid a,
    .student-account-generated-card {
      border: 1px solid var(--academy-line);
      border-radius: 1rem;
      padding: .85rem;
      background: color-mix(in srgb, var(--academy-text) 5%, transparent);
      color: var(--academy-text);
      text-decoration: none;
      font-weight: 800;
    }

    .student-account-generated {
      scroll-margin-top: 7rem;
    }

    .student-account-generated .empty-illustration {
      width: 5.5rem;
      height: 5.5rem;
      display: grid;
      place-items: center;
      margin-bottom: 1rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--academy-accent) 16%, transparent);
      font-size: 2rem;
    }

    .student-account-generated-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .75rem;
      margin-top: 1rem;
    }

    #student-reports .landing-stats {
      margin-top: 1rem;
    }

    #student-personal-details,
    #student-learning,
    #student-jobs,
    #student-certifications,
    #student-connections,
    #student-subscriptions,
    #student-order-history,
    #student-reports {
      scroll-margin-top: 7rem;
    }

    @media (max-width: 980px) {
      .student-account-sidebar-shell {
        grid-template-columns: 1fr;
      }

      .student-account-sidebar-card {
        position: static;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .student-account-sidebar-title {
        grid-column: 1 / -1;
      }

      .student-account-nav-grid,
      .student-account-generated-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      .student-account-sidebar-card,
      .student-account-nav-grid,
      .student-account-generated-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}

function hasStudentRoleSelected() {
  return Array.from(document.querySelectorAll<HTMLElement>(".role-entry.selected")).some((entry) =>
    entry.textContent?.toLowerCase().includes("student")
  );
}

function findPanelByHeading(heading: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".command-panel h2"))
    .find((element) => element.textContent?.trim().toLowerCase() === heading.toLowerCase())
    ?.closest<HTMLElement>(".command-panel") ?? null;
}

function setSectionId(element: HTMLElement | null, id: string) {
  if (!element) return;
  element.id = id;
  element.classList.add("student-account-section");
}

function ensureGeneratedSection(main: HTMLElement, section: (typeof generatedSections)[number]) {
  if (document.getElementById(section.id)) return;

  const element = document.createElement("section");
  element.id = section.id;
  element.className = "command-panel student-account-generated";
  element.innerHTML = `
    <div class="empty-illustration" aria-hidden="true">${section.eyebrow === "Connections" ? "🤝" : section.eyebrow === "Certifications" ? "🏅" : section.eyebrow === "Subscriptions" ? "📄" : "🧾"}</div>
    <p class="eyebrow">${section.eyebrow}</p>
    <h2>${section.title}</h2>
    <p>${section.detail}</p>
    <div class="student-account-generated-grid">
      ${section.cards.map((card) => `<div class="student-account-generated-card">${card}</div>`).join("")}
    </div>
  `;

  main.append(element);
}

function ensureReportsSection(main: HTMLElement) {
  if (document.getElementById("student-reports")) return;

  const courseCount = document.querySelectorAll("#student-learning .card").length || "—";
  const roleCount = document.querySelectorAll("#student-jobs .card").length || "—";
  const registrationPanel = findPanelByHeading("My registrations");
  const registrationCount = registrationPanel?.querySelectorAll(".card, tbody tr").length || 0;

  const section = document.createElement("section");
  section.id = "student-reports";
  section.className = "command-panel student-account-generated";
  section.innerHTML = `
    <div class="empty-illustration" aria-hidden="true">📊</div>
    <p class="eyebrow">Reports</p>
    <h2>Student progress summary</h2>
    <p>Use this area for learner activity, course progress, registration history and certification readiness reporting.</p>
    <div class="landing-stats" aria-label="Student account summary">
      <div><strong>${courseCount}</strong><span>Learning cards</span></div>
      <div><strong>${registrationCount}</strong><span>Registrations</span></div>
      <div><strong>${roleCount}</strong><span>Career roles</span></div>
    </div>
  `;

  main.append(section);
}

function ensureSidebar(main: HTMLElement) {
  if (document.getElementById(STUDENT_ACCOUNT_NAV_ID)) return;

  const workspaceGrid = main.querySelector<HTMLElement>(".workspace-grid");
  const shell = document.createElement("section");
  shell.id = STUDENT_ACCOUNT_NAV_ID;
  shell.className = "student-account-sidebar-shell";
  shell.setAttribute("aria-label", "Student account navigation");
  shell.innerHTML = `
    <aside class="student-account-sidebar-card">
      <p class="student-account-sidebar-title">My Account</p>
      ${studentAccountNavItems
        .map((item) => `<a href="#${item.id}"><span aria-hidden="true">${item.icon}</span>${item.label}</a>`)
        .join("")}
    </aside>
    <article class="student-account-intro-card">
      <p class="eyebrow">Student account</p>
      <h2>Manage your learner profile, learning activity, career links and progress reports.</h2>
      <p>This account navigation mirrors the required student web interface structure: personal details, learning, certifications, jobs, connections, subscriptions, order history and reports.</p>
      <div class="student-account-nav-grid">
        ${studentAccountNavItems.map((item) => `<a href="#${item.id}">${item.label}</a>`).join("")}
      </div>
    </article>
  `;

  workspaceGrid?.insertAdjacentElement("afterend", shell);
}

function removeStudentAccountEnhancement(main: HTMLElement) {
  main.classList.remove("student-account-enabled");
  document.getElementById(STUDENT_ACCOUNT_NAV_ID)?.remove();
  document.querySelectorAll(".student-account-generated").forEach((section) => section.remove());
}

function enhanceStudentAccountNavigation() {
  const main = document.querySelector<HTMLElement>(".portal-main");
  if (!main) return;

  if (!hasStudentRoleSelected()) {
    removeStudentAccountEnhancement(main);
    return;
  }

  injectStudentAccountStyles();
  main.classList.add("student-account-enabled");

  setSectionId(findPanelByHeading("Profile"), "student-personal-details");
  setSectionId(document.querySelector<HTMLElement>('section.content-grid[aria-label="Courses and classes"]'), "student-learning");
  setSectionId(findPanelByHeading("Open roles"), "student-jobs");

  generatedSections.forEach((section) => ensureGeneratedSection(main, section));
  ensureReportsSection(main);
  ensureSidebar(main);
}

let nextFrame = 0;
function scheduleStudentAccountNavigation() {
  cancelAnimationFrame(nextFrame);
  nextFrame = requestAnimationFrame(enhanceStudentAccountNavigation);
}

if (typeof window !== "undefined") {
  window.addEventListener("load", scheduleStudentAccountNavigation);
  document.addEventListener("click", () => setTimeout(scheduleStudentAccountNavigation, 0));

  const observer = new MutationObserver(scheduleStudentAccountNavigation);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleStudentAccountNavigation();
}

export {};
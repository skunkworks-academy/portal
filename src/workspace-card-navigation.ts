const STUDENT_DESTINATION = "https://www.skunkworksacademy.com/students/";

const roleDestinationSelectors: Record<string, string[]> = {
  Instructor: [
    '[aria-label="Instructor jobs and profile"]',
    '[aria-label="Role-specific operations"]'
  ],
  Staff: [
    '[aria-label="Role-specific operations"]',
    '[aria-label="Portal dashboard"]'
  ]
};

function getEntryRole(entry: HTMLElement) {
  return entry.querySelector<HTMLElement>(".eyebrow")?.textContent?.trim() ?? "";
}

function getRoleDestination(role: string) {
  const selectors = roleDestinationSelectors[role] ?? [];
  for (const selector of selectors) {
    const section = document.querySelector<HTMLElement>(selector);
    if (section) return section;
  }
  return document.querySelector<HTMLElement>("#main");
}

function scrollToRoleInterface(role: string) {
  window.setTimeout(() => {
    getRoleDestination(role)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 75);
}

function navigateToStudentExperience() {
  window.location.assign(STUDENT_DESTINATION);
}

function activateWorkspaceEntry(entry: HTMLElement, triggerRoleButton = true) {
  const role = getEntryRole(entry);
  if (role === "Student") {
    navigateToStudentExperience();
    return;
  }
  if (triggerRoleButton) entry.querySelector<HTMLButtonElement>("button")?.click();
  scrollToRoleInterface(role);
}

function prepareWorkspaceEntries() {
  document.querySelectorAll<HTMLElement>(".role-entry").forEach((entry) => {
    const role = getEntryRole(entry);
    entry.tabIndex = 0;
    entry.setAttribute("role", "button");
    entry.setAttribute("aria-label", role ? `Use ${role} view` : "Use workspace view");
    if (role === "Student") {
      entry.dataset.destination = STUDENT_DESTINATION;
      const button = entry.querySelector<HTMLButtonElement>("button");
      if (button) button.setAttribute("aria-label", "Open Student workspace");
    }
  });
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const entry = target?.closest<HTMLElement>(".role-entry");
  if (!entry || target?.closest("a, input, select, textarea")) return;

  if (getEntryRole(entry) === "Student") {
    event.preventDefault();
    navigateToStudentExperience();
    return;
  }

  activateWorkspaceEntry(entry, !target?.closest("button"));
});

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const entry = target?.closest<HTMLElement>(".role-entry");
  if (!entry || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  activateWorkspaceEntry(entry);
});

const observer = new MutationObserver(prepareWorkspaceEntries);
observer.observe(document.documentElement, { childList: true, subtree: true });
prepareWorkspaceEntries();

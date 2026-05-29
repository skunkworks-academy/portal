import type { PortalRole } from "./types";

export type Tab =
  | "dashboard"
  | "courses"
  | "classes"
  | "register"
  | "jobs"
  | "applications"
  | "instructors"
  | "students"
  | "profile"
  | "resources"
  | "settings"
  | "staff";

export interface RoleDefinition {
  label: PortalRole;
  headline: string;
  summary: string;
  nav: Array<{ tab: Tab; label: string }>;
  capabilities: string[];
  resources: Array<{ title: string; detail: string }>;
}

export const roleDefinitions: Record<PortalRole, RoleDefinition> = {
  Student: {
    label: "Student",
    headline: "Student learning portal",
    summary: "Find courses, register for classes, and track the cohorts you are enrolled in.",
    nav: [
      { tab: "dashboard", label: "Dashboard" },
      { tab: "courses", label: "Courses" },
      { tab: "classes", label: "My Classes" },
      { tab: "register", label: "Register" },
      { tab: "resources", label: "Resources" },
      { tab: "profile", label: "Profile" }
    ],
    capabilities: ["Browse courses", "Register for classes", "Track enrolled classes", "Use learner resources"],
    resources: [
      { title: "Learner onboarding guide", detail: "Prepare your Microsoft account, course access, class schedule, and support channels before day one." },
      { title: "Class participation checklist", detail: "Know what to bring to live sessions, labs, assessments, and attendance checkpoints." },
      { title: "Student support routes", detail: "Find the right support path for course access, schedule changes, and learning blockers." }
    ]
  },
  Instructor: {
    label: "Instructor",
    headline: "Instructor onboarding portal",
    summary: "Apply for teaching roles, maintain your instructor profile, upload documents, and monitor assigned classes.",
    nav: [
      { tab: "dashboard", label: "Dashboard" },
      { tab: "jobs", label: "Jobs" },
      { tab: "applications", label: "My Applications" },
      { tab: "classes", label: "My Classes" },
      { tab: "resources", label: "Resources" },
      { tab: "profile", label: "Profile" }
    ],
    capabilities: ["Apply for jobs", "Manage applications", "Update instructor profile", "Monitor assigned classes"],
    resources: [
      { title: "Instructor readiness checklist", detail: "Contracts, profile details, identity checks, availability, and teaching document readiness." },
      { title: "Demo lesson scorecard", detail: "A consistent review frame for technical depth, learner empathy, pacing, and lab readiness." },
      { title: "Programme handoff pack", detail: "Cohort calendar, lesson plan, assessment rubrics, classroom links, and escalation contacts." }
    ]
  },
  Staff: {
    label: "Staff",
    headline: "Staff operations portal",
    summary: "Post jobs, review applications, schedule classes, monitor students, and manage instructor onboarding.",
    nav: [
      { tab: "dashboard", label: "Dashboard" },
      { tab: "staff", label: "Operations" },
      { tab: "jobs", label: "Jobs" },
      { tab: "applications", label: "Applications" },
      { tab: "instructors", label: "Instructors" },
      { tab: "students", label: "Students" },
      { tab: "classes", label: "Scheduling" },
      { tab: "resources", label: "Resources" },
      { tab: "settings", label: "Settings" }
    ],
    capabilities: ["Post jobs", "Review instructor applications", "Manage class schedules", "Monitor students and onboarding"],
    resources: [
      { title: "Application review playbook", detail: "Screening stages, ownership rules, interview criteria, and offer handoff guidance." },
      { title: "Scheduling operations guide", detail: "Classroom setup, instructor assignment, cohort dates, attendance tracking, and Teams channels." },
      { title: "Onboarding tracker", detail: "Monitor instructor documents, profile completeness, demo lessons, and class readiness." }
    ]
  }
};

export function roleFromClaims(roles: string[], isTrustedTenant: boolean): PortalRole {
  if (!isTrustedTenant) return "Student";
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  if (normalizedRoles.includes("portal.admin") || normalizedRoles.includes("portal.staff")) return "Staff";
  if (normalizedRoles.includes("portal.instructor")) return "Instructor";
  return "Student";
}

export function canAccess(role: PortalRole, tab: Tab, isAdmin: boolean) {
  if (tab === "staff" || tab === "instructors" || tab === "students" || tab === "settings") return role === "Staff" || isAdmin;
  return roleDefinitions[role].nav.some((item) => item.tab === tab);
}

export const landingRoles = [
  {
    role: "Student" as PortalRole,
    title: "Students",
    detail: "Enroll in courses, register for classes, and keep learning progress in one place."
  },
  {
    role: "Instructor" as PortalRole,
    title: "Instructors",
    detail: "Apply for roles, manage applications, update profiles, and monitor assigned classes."
  },
  {
    role: "Staff" as PortalRole,
    title: "Staff",
    detail: "Manage postings, schedules, applications, instructor onboarding, and student operations."
  }
];

export const courseCatalog = [
  { id: "ai-tools", title: "Applied AI Tools", level: "Short course", duration: "4 weeks", description: "Prompt workflows, responsible use, automation, and workplace AI productivity." },
  { id: "cybersecurity", title: "Security Analyst Academy", level: "Professional track", duration: "12 weeks", description: "Security fundamentals, labs, incident response, and analyst capstone work." },
  { id: "cloud", title: "Cloud Practitioner Track", level: "Foundation", duration: "8 weeks", description: "Cloud fundamentals, deployment practice, troubleshooting, and exam readiness." }
];

export const classSchedule = [
  { id: "cls-ai-june", courseId: "ai-tools", title: "AI Tools June Cohort", schedule: "Tue and Thu, 18:00", seats: 24, instructor: "Pending assignment" },
  { id: "cls-sec-july", courseId: "cybersecurity", title: "Security Analyst July Cohort", schedule: "Mon and Wed, 17:30", seats: 18, instructor: "Pending assignment" },
  { id: "cls-cloud-june", courseId: "cloud", title: "Cloud Practitioner June Cohort", schedule: "Saturday, 09:00", seats: 30, instructor: "Pending assignment" }
];

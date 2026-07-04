export type ApiCourseLesson = {
  id: string;
  title: string;
  type: "lesson" | "lab" | "assessment";
  minutes: number;
  moduleId: string;
  moduleTitle: string;
  summary: string;
};

export type ApiCourseModule = {
  id: string;
  title: string;
  summary: string;
  lessons: ApiCourseLesson[];
};

export type ApiCourseQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

export const exchangeBulkMailApiCourse = {
  slug: "exchange-online-bulk-mail-management",
  code: "M365-EXO-BMM-101",
  title: "Microsoft Exchange Online Bulk Mail Management",
  subtitle: "Guide and best practices for bulk email setup and sending using distribution lists",
  level: "Intermediate",
  duration: "8-10 hours",
  badge: "Skunkworks Academy Exchange Online Bulk Mail Management Completion Badge",
  requiredAssessmentScore: 80,
  modules: [
    {
      id: "m1-foundations",
      title: "Foundations: Bulk Mail in Exchange Online",
      summary: "Classify bulk-mail workloads before selecting a sending path.",
      lessons: [
        { id: "bulk-mail-operating-model", title: "Bulk mail operating model", type: "lesson", minutes: 25, moduleId: "m1-foundations", moduleTitle: "Foundations: Bulk Mail in Exchange Online", su[...]
        { id: "architecture-decision-tree", title: "Architecture decision tree", type: "lesson", minutes: 30, moduleId: "m1-foundations", moduleTitle: "Foundations: Bulk Mail in Exchange Online", [...]
      ]
    },
    {
      id: "m2-limits-terrl",
      title: "Exchange Online Limits and TERRL",
      summary: "Understand mailbox, message and tenant-level outbound controls.",
      lessons: [
        { id: "limits-that-matter", title: "Limits that matter", type: "lesson", minutes: 35, moduleId: "m2-limits-terrl", moduleTitle: "Exchange Online Limits and TERRL", summary: "Map each Excha[...]
        { id: "terrl-impact-simulator", title: "TERRL impact simulator", type: "lab", minutes: 40, moduleId: "m2-limits-terrl", moduleTitle: "Exchange Online Limits and TERRL", summary: "Model dis[...]
      ]
    },
    {
      id: "m3-distribution-lists",
      title: "Distribution List Design and Governance",
      summary: "Create safe, maintainable and auditable recipient structures.",
      lessons: [
        { id: "dl-design-patterns", title: "Distribution list design patterns", type: "lesson", minutes: 30, moduleId: "m3-distribution-lists", moduleTitle: "Distribution List Design and Governanc[...]
        { id: "dl-powershell-runbook", title: "Distribution list PowerShell runbook", type: "lab", minutes: 45, moduleId: "m3-distribution-lists", moduleTitle: "Distribution List Design and Govern[...]
      ]
    },
    {
      id: "m4-deliverability",
      title: "Authentication and Deliverability",
      summary: "Protect sender reputation and align domains before operational or bulk sending.",
      lessons: [
        { id: "sender-authentication", title: "SPF, DKIM, DMARC and subdomain strategy", type: "lesson", minutes: 35, moduleId: "m4-deliverability", moduleTitle: "Authentication and Deliverability[...]
      ]
    },
    {
      id: "m5-monitoring",
      title: "Monitoring and Troubleshooting",
      summary: "Use reports, message trace and evidence to detect risk early.",
      lessons: [
        { id: "monitoring-runbook", title: "Monitoring runbook", type: "lesson", minutes: 35, moduleId: "m5-monitoring", moduleTitle: "Monitoring and Troubleshooting", summary: "Build an evidence [...]
      ]
    },
    {
      id: "m6-capstone",
      title: "Capstone: Bulk Mail Architecture Review",
      summary: "Design a safe messaging pattern for three business workloads.",
      lessons: [
        { id: "capstone-brief", title: "Capstone brief", type: "assessment", minutes: 60, moduleId: "m6-capstone", moduleTitle: "Capstone: Bulk Mail Architecture Review", summary: "Submit an archi[...]
      ]
    }
  ] satisfies ApiCourseModule[]
};

export const exchangeBulkMailFinalAssessment: ApiCourseQuestion[] = [
  {
    id: "q1",
    prompt: "A single message is sent to a distribution group that expands to many external recipients. What is the main TERRL risk?",
    options: ["The sender's mailbox size increases", "Expanded external recipients can consume tenant external-recipient capacity", "The group owner is automatically removed", "DKIM is disabled"],
    answer: "Expanded external recipients can consume tenant external-recipient capacity",
    explanation: "TERRL is tenant-level and counts external recipients over a rolling window."
  },
  {
    id: "q2",
    prompt: "Which workload is the best fit for Microsoft 365 High Volume Email?",
    options: ["External newsletter campaign", "Internal application or device-generated mail", "Cold outreach to purchased lists", "Consumer marketing automation"],
    answer: "Internal application or device-generated mail",
    explanation: "HVE is positioned for internal high-volume application or device mail."
  },
  {
    id: "q3",
    prompt: "Why should a dedicated subdomain be considered for bulk or service-driven mail?",
    options: ["It removes all recipient limits", "It avoids all moderation", "It reduces reputation blast radius for the primary user-mail domain", "It makes message trace unnecessary"],
    answer: "It reduces reputation blast radius for the primary user-mail domain",
    explanation: "A subdomain separates reputation and authentication posture from primary user mail."
  },
  {
    id: "q4",
    prompt: "What should a large distribution group have before broad use?",
    options: ["No owners", "Open sending from any external sender", "Delivery management, ownership and review controls", "A disabled moderation workflow"],
    answer: "Delivery management, ownership and review controls",
    explanation: "Large groups need ownership, approval and sender-control discipline."
  },
  {
    id: "q5",
    prompt: "Which evidence is most useful when troubleshooting suspected throttling or blocking?",
    options: ["Only the sender's opinion", "Message trace, NDR code, sender, time range and recipient count", "A screenshot of Outlook only", "The group display name only"],
    answer: "Message trace, NDR code, sender, time range and recipient count",
    explanation: "Operational escalation needs objective evidence."
  }
];

export function exchangeBulkMailLessons(): ApiCourseLesson[] {
  return exchangeBulkMailApiCourse.modules.flatMap((module) => module.lessons);
}

export function findExchangeBulkMailLesson(lessonId: string) {
  return exchangeBulkMailLessons().find((lesson) => lesson.id === lessonId);
}

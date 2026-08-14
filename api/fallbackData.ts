import type { ClassSession, CourseRecord, JobPosting } from "../src/types.js";

export const fallbackJobs: JobPosting[] = [
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

export const fallbackCourses: CourseRecord[] = [
  {
    id: "ART-101",
    title: "Professional Articulation and Executive Communication",
    level: "Professional capability",
    duration: "36–40 hours",
    description: "Recorded practice, executive presence, meetings, interviews, business storytelling and moderated communication evidence.",
    status: "Live"
  },
  {
    id: "ai-tools",
    title: "Applied AI Tools",
    level: "Short course",
    duration: "4 weeks",
    description: "Prompt workflows, responsible use, automation, and workplace AI productivity.",
    status: "Live"
  },
  {
    id: "cybersecurity",
    title: "Security Analyst Academy",
    level: "Professional track",
    duration: "12 weeks",
    description: "Security fundamentals, labs, incident response, and analyst capstone work.",
    status: "Live"
  },
  {
    id: "cloud",
    title: "Cloud Practitioner Track",
    level: "Foundation",
    duration: "8 weeks",
    description: "Cloud fundamentals, deployment practice, troubleshooting, and exam readiness.",
    status: "Live"
  }
];

export const fallbackClasses: ClassSession[] = [
  {
    id: "cls-ai-june",
    courseId: "ai-tools",
    courseTitle: "Applied AI Tools",
    title: "AI Tools June Cohort",
    schedule: "Tue and Thu, 18:00",
    modality: "Hybrid",
    instructor: "Pending assignment",
    seats: 24,
    enrolled: 0,
    status: "Open"
  },
  {
    id: "cls-sec-july",
    courseId: "cybersecurity",
    courseTitle: "Security Analyst Academy",
    title: "Security Analyst July Cohort",
    schedule: "Mon and Wed, 17:30",
    modality: "Hybrid",
    instructor: "Pending assignment",
    seats: 18,
    enrolled: 0,
    status: "Open"
  },
  {
    id: "cls-cloud-june",
    courseId: "cloud",
    courseTitle: "Cloud Practitioner Track",
    title: "Cloud Practitioner June Cohort",
    schedule: "Saturday, 09:00",
    modality: "On campus",
    instructor: "Pending assignment",
    seats: 30,
    enrolled: 0,
    status: "Open"
  }
];

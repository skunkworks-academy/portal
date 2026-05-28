export type JobStatus = "Draft" | "Live" | "Closed";
export type ApplicationStatus = "Submitted" | "Screening" | "Interview" | "Offer" | "Rejected";
export type TaskStatus = "Due" | "InProgress" | "Ready" | "Complete";

export interface JobPosting {
  id: string;
  title: string;
  programme: string;
  modality: string;
  rateBand: string;
  closingDate: string;
  status: JobStatus;
  description: string;
  applicants: number;
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  jobTitle: string;
  applicantName: string;
  applicantEmail: string;
  phone: string;
  discipline: string;
  availability: string;
  experience: string;
  status: ApplicationStatus;
  owner: string;
  submittedAt: string;
  documentUrl?: string;
}

export interface OnboardingTask {
  id: string;
  title: string;
  candidateName: string;
  owner: string;
  dueDate: string;
  status: TaskStatus;
  detail: string;
}

export interface NewApplication {
  jobId: string;
  applicantName: string;
  applicantEmail: string;
  phone: string;
  discipline: string;
  availability: string;
  experience: string;
  resumeFileName?: string;
  resumeBase64?: string;
}

export interface JobInput {
  title: string;
  programme: string;
  modality: string;
  rateBand: string;
  closingDate: string;
  status: JobStatus;
  description: string;
}

export interface UserProfile {
  name: string;
  username: string;
  tenantId?: string;
  roles: string[];
  isAdmin: boolean;
}

export interface PortalHealth {
  ok: boolean;
  service: string;
  missingSettings: string[];
  allowedOrigins: string[];
  routes?: string[];
}

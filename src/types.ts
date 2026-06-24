export type JobStatus = "Draft" | "Live" | "Closed";
export type ApplicationStatus = "Submitted" | "Screening" | "Interview" | "Offer" | "Rejected";
export type TaskStatus = "Due" | "InProgress" | "Ready" | "Complete";
export type ClassStatus = "Scheduled" | "Open" | "Full" | "InProgress" | "Complete" | "Cancelled";
export type PortalRole = "Student" | "Instructor" | "Staff";

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

export interface CourseRecord {
  id: string;
  title: string;
  level: string;
  duration: string;
  description: string;
  status: "Draft" | "Live" | "Archived";
}

export interface ClassSession {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  schedule: string;
  modality: string;
  instructor: string;
  seats: number;
  enrolled: number;
  status: ClassStatus;
}

export interface ClassInput {
  courseId: string;
  courseTitle: string;
  title: string;
  schedule: string;
  modality: string;
  instructor: string;
  seats: number;
  status: ClassStatus;
}

export interface ClassRegistrationRecord {
  id: string;
  classId: string;
  classTitle: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  studentEmail: string;
  studentObjectId: string;
  status: "Registered" | "Waitlisted" | "Cancelled";
  registeredAt: string;
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
  assignee?: string;
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
  portalRole: PortalRole;
}

export interface PortalProfile {
  id: string;
  objectId: string;
  displayName: string;
  email: string;
  portalRole: PortalRole;
  phone: string;
  location: string;
  bio: string;
  cvFileName: string;
  cvDocumentUrl?: string;
  updatedAt: string;
  cvWebUrl?: string;
}

export interface PortalProfileInput {
  displayName: string;
  portalRole: PortalRole;
  phone: string;
  location: string;
  bio: string;
  cvFileName?: string;
  cvBase64?: string;
}

export interface PortalHealth {
  ok: boolean;
  service: string;
  missingSettings: string[];
  allowedOrigins: string[];
  routes?: string[];
}

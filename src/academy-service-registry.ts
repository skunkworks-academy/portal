/**
 * One discoverable Academy ecosystem, with no implication that every linked
 * service is deployed or that opening a link grants an entitlement.
 *
 * This is UI metadata only. Every backend must validate session, role, tenant
 * membership and paid entitlement independently.
 */
export type AcademyServiceArea =
  | "Learning"
  | "Career development"
  | "Credentials"
  | "Community"
  | "Cloud labs"
  | "Vendor catalogues"
  | "Microsoft 365";

export type AcademyServiceStatus = "linked" | "planned";

export interface AcademyService {
  id: string;
  name: string;
  area: AcademyServiceArea;
  summary: string;
  status: AcademyServiceStatus;
  href: string | null;
  access: "public" | "sign-in-required" | "entitlement-required";
}

export const academyServiceRegistry: readonly AcademyService[] = [
  {
    id: "student-lms",
    name: "My learning",
    area: "Learning",
    summary: "Courses, lessons, PDFs, videos, quizzes, cohort schedules and Skunkie study assistance.",
    status: "planned",
    href: null,
    access: "sign-in-required"
  },
  {
    id: "career-development",
    name: "Careers and development",
    area: "Career development",
    summary: "Career assessments, individual development plans, job discovery, applications and portfolio growth.",
    status: "linked",
    href: "https://careers.skunkworksacademy.com/",
    access: "sign-in-required"
  },
  {
    id: "badging",
    name: "Badges and credentials",
    area: "Credentials",
    summary: "Credential verification, badge tracking, learning milestones and upskilling evidence.",
    status: "linked",
    href: "https://badging.skunkworksacademy.com/",
    access: "sign-in-required"
  },
  {
    id: "community",
    name: "Academy community",
    area: "Community",
    summary: "Peer discussions, study groups, mentorship and cohort collaboration; integration pending.",
    status: "planned",
    href: null,
    access: "sign-in-required"
  },
  {
    id: "labs",
    name: "Cloud lab rentals",
    area: "Cloud labs",
    summary: "Discover labs. Runtime provisioning, metering, budget caps and teardown require a protected control plane.",
    status: "linked",
    href: "https://labs.skunkworksacademy.com/",
    access: "entitlement-required"
  },
  {
    id: "ibm",
    name: "IBM catalogue",
    area: "Vendor catalogues",
    summary: "Explore Academy IBM training and learning pathways.",
    status: "linked",
    href: "https://www.skunkworksacademy.com/ibm/",
    access: "public"
  },
  {
    id: "microsoft",
    name: "Microsoft learning",
    area: "Vendor catalogues",
    summary: "Explore Academy Microsoft courses and learning pathways.",
    status: "linked",
    href: "https://www.skunkworksacademy.com/microsoft/",
    access: "public"
  },
  {
    id: "google",
    name: "Google learning",
    area: "Vendor catalogues",
    summary: "Explore Academy Google courses and learning pathways.",
    status: "linked",
    href: "https://www.skunkworksacademy.com/google/",
    access: "public"
  },
  {
    id: "comptia",
    name: "CompTIA catalogue",
    area: "Vendor catalogues",
    summary: "Explore Academy CompTIA certification preparation and training.",
    status: "linked",
    href: "https://www.skunkworksacademy.com/comptia/",
    access: "public"
  },
  {
    id: "microsoft365",
    name: "Microsoft 365 on the web",
    area: "Microsoft 365",
    summary: "Launch Microsoft 365 web applications when the signed-in user has an eligible assigned licence.",
    status: "linked",
    href: "https://www.microsoft365.com/",
    access: "entitlement-required"
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    area: "Microsoft 365",
    summary: "Launch Teams using the signed-in account and its assigned service plans.",
    status: "linked",
    href: "https://teams.microsoft.com/",
    access: "entitlement-required"
  }
] as const;

/** Returns only verified configured links, never guesses a URL for a planned service. */
export function linkedAcademyServices(area?: AcademyServiceArea): AcademyService[] {
  return academyServiceRegistry.filter(
    (service) => service.status === "linked" && Boolean(service.href) && (!area || service.area === area)
  );
}

/** Access control is deliberately never implemented using this client-side registry. */
export function hasConfiguredAcademyService(id: string): boolean {
  return linkedAcademyServices().some((service) => service.id === id);
}

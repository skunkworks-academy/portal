/**
 * Publication policy is an API authorization contract, not a marketing flag.
 * New AI courses require three independently recorded approvals before
 * server-side enrolment or checkout can be enabled.
 */
export interface CourseApproval {
  editorialEvidence: string;
  commercialEvidence: string;
  qaEvidence: string;
  approvedBy: string;
  approvedAt: string;
  publicUrl: string;
  entitlementScope: string;
}
export type CoursePublication = {
  id: string;
  title: string;
  status: 'published' | 'review';
  approval: CourseApproval | null;
  origin: 'legacy-published' | 'generated-foundation';
};

/** Existing production-allowlisted courses are grandfathered. No new AI approval is implied. */
const legacy = [
  { id: "SHP-UPA-101", title: "Shopify User Permissions" },
  { id: "GHP-DOM-101", title: "GitHub Pages Setup" },
  { id: "M365-LIC-101", title: "Microsoft 365 Licenses" },
  { id: "SKW-BEG-AI-101", title: "Generative AI & ChatGPT for Beginners" },
  { id: "SKW-BEG-CYB-101", title: "Cybersecurity Essentials & Online Safety" },
  { id: "SKW-BEG-IT-101", title: "IT Support & Computer Troubleshooting Fundamentals" },
  { id: "SKW-BEG-M365-101", title: "Microsoft 365 & Excel Productivity Essentials" },
  { id: "SKW-BEG-CLD-101", title: "Cloud Computing Fundamentals" }
] as const;

const foundationAI = [
  [
    "SWA-AI-001",
    "Automation & AI Integration Specialist"
  ],
  [
    "SWA-AI-002",
    "AI for Business: Driving Innovation, Decision-Making and Efficiency"
  ],
  [
    "SWA-AI-003",
    "AI Fundamentals"
  ],
  [
    "SWA-AI-004",
    "AI Fundamentals: Introduction to AI, ML and DL Concepts"
  ],
  [
    "SWA-AI-005",
    "AI Mastery: From Foundations to Deployment"
  ],
  [
    "SWA-AI-006",
    "Applied Artificial Intelligence: Solving Real-World Problems"
  ],
  [
    "SWA-AI-007",
    "ChatGPT Mastery: Unlocking Conversational AI Potential"
  ],
  [
    "SWA-AI-008",
    "Collecting and Processing Personal Data Using AI"
  ],
  [
    "SWA-AI-009",
    "Effective AI Prompting"
  ],
  [
    "SWA-AI-010",
    "Exploring Artificial Intelligence: From Theory to Applications"
  ],
  [
    "SWA-AI-011",
    "Leveraging AI in Sales: A Guide for Chief Sales Officers"
  ],
  [
    "SWA-AI-012",
    "Natural Language Processing (NLP)"
  ],
  [
    "SWA-AI-013",
    "Personal Data Processing and AI"
  ],
  [
    "SWA-AI-014",
    "Prompt Engineering for Large Language Models"
  ],
  [
    "SWA-AI-015",
    "Interactive Chat-Based Learning Experience"
  ],
  [
    "SWA-AI-016",
    "Pragmatic AI: Integrating Machine Learning with Drools"
  ],
  [
    "SWA-APP-009",
    "Integrating GitHub, Firebase, OpenAI, Google AI Studio and Microsoft Copilot"
  ],
  [
    "SWA-SEC-013",
    "LLM Security"
  ],
  [
    "SWA-IBM-026",
    "IBM watsonx Foundations"
  ]
] as const;

export const coursePublicationRegistry: ReadonlyArray<CoursePublication> = [
  ...legacy.map(course => ({
    ...course,
    origin: 'legacy-published' as const,
    status: 'published' as const,
    approval: null
  })),
  ...foundationAI.map(([id, title]) => ({
    id, title,
    origin: 'generated-foundation' as const,
    status: 'review' as const,
    approval: null
  }))
];

export function hasDocumentedApproval(course: CoursePublication): boolean {
  if (course.origin === 'legacy-published') return false;
  if (course.status !== 'published' || !course.approval) return false;
  const a = course.approval;
  if (![a.editorialEvidence, a.commercialEvidence, a.qaEvidence, a.approvedBy, a.approvedAt, a.publicUrl, a.entitlementScope].every(x => typeof x === 'string' && x.trim().length > 0)) return false;
  if (Number.isNaN(Date.parse(a.approvedAt))) return false;
  try { return new URL(a.publicUrl).protocol === 'https:' && /^academy\.course\.[A-Z0-9-]+$/.test(a.entitlementScope) && a.entitlementScope === 'academy.course.' + course.id; }
  catch { return false; }
}

export function isCoursePublished(id: unknown): boolean {
  const code = String(id ?? '').trim().toUpperCase();
  return coursePublicationRegistry.some(c => c.id === code && (c.origin === 'legacy-published' ? c.status === 'published' : hasDocumentedApproval(c)));
}

export const publishedCourseCatalog = coursePublicationRegistry
  .filter(course => isCoursePublished(course.id))
  .map(({id, title}) => ({id, title}));

/**
 * Public, machine-readable status export. Approvals never flow from the
 * browser to this registry and a client-facing status is NOT proof of entitlement.
 */
export function coursePublicationSnapshot() {
  return {
    schema: 'skunkworks-academy/course-publication/v1',
    generatedAt: new Date().toISOString(),
    policy: 'default-deny',
    courses: coursePublicationRegistry.map(course => ({
      courseId: course.id,
      title: course.title,
      publicationStatus: isCoursePublished(course.id) ? 'published' : 'review',
      enrolmentStatus: isCoursePublished(course.id) ? 'portal-allowlisted' : 'enquiry-only',
      source: course.origin,
      review: course.origin === 'generated-foundation' ? {
        editorial: course.approval?.editorialEvidence ? 'approved' : 'pending',
        commercial: course.approval?.commercialEvidence ? 'approved' : 'pending',
        quality: course.approval?.qaEvidence ? 'approved' : 'pending',
      } : { editorial: 'legacy', commercial: 'legacy', quality: 'legacy' },
      publicUrl: course.approval?.publicUrl ?? null,
      checkoutUrl: isCoursePublished(course.id)
        ? 'https://portal.skunkworksacademy.com/checkout/?courseId=' + encodeURIComponent(course.id)
        : null
    }))
  };
}

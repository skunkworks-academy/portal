export type RegistrationSource = "Marketing" | "Portal" | "Microsoft";
export type RegistrationOfferType = "Course" | "Learning path" | "Material" | "Badge pathway";

export interface RegistrationCourse {
  slug: string;
  title: string;
  type: RegistrationOfferType;
  source: RegistrationSource;
  level: string;
  duration: string;
  description: string;
  overviewUrl: string;
  registerUrl: string;
}

export const registrationCourses: RegistrationCourse[] = [
  {
    slug: "marketing-fundamentals",
    title: "Marketing Fundamentals",
    type: "Course",
    source: "Marketing",
    level: "Foundation",
    duration: "6 hours",
    description: "Build a working understanding of markets, customer value, positioning, segmentation and the marketing mix.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/marketing-fundamentals/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=marketing-fundamentals"
  },
  {
    slug: "digital-marketing-strategy",
    title: "Digital Marketing Strategy",
    type: "Learning path",
    source: "Marketing",
    level: "Intermediate",
    duration: "4 weeks",
    description: "Translate business objectives into integrated channel, content, campaign and measurement plans.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/digital-marketing-strategy/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=digital-marketing-strategy"
  },
  {
    slug: "content-marketing-editorial-planning",
    title: "Content Marketing & Editorial Planning",
    type: "Course",
    source: "Marketing",
    level: "Intermediate",
    duration: "8 hours",
    description: "Design content pillars, editorial calendars, audience journeys and reusable campaign assets.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/content-marketing-editorial-planning/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=content-marketing-editorial-planning"
  },
  {
    slug: "seo-foundations",
    title: "SEO Foundations",
    type: "Course",
    source: "Marketing",
    level: "Foundation",
    duration: "7 hours",
    description: "Use search intent, keyword research, on-page optimisation and technical checks to improve discovery.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/seo-foundations/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=seo-foundations"
  },
  {
    slug: "social-media-campaign-operations",
    title: "Social Media Campaign Operations",
    type: "Course",
    source: "Marketing",
    level: "Intermediate",
    duration: "10 hours",
    description: "Plan, publish, govern and optimise social campaigns across organic and paid channels.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/social-media-campaign-operations/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=social-media-campaign-operations"
  },
  {
    slug: "email-marketing-lifecycle-automation",
    title: "Email Marketing & Lifecycle Automation",
    type: "Course",
    source: "Marketing",
    level: "Intermediate",
    duration: "8 hours",
    description: "Build permission-based lifecycle journeys, segmentation, nurture sequences and performance reporting.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/email-marketing-lifecycle-automation/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=email-marketing-lifecycle-automation"
  },
  {
    slug: "marketing-analytics-workbook",
    title: "Marketing Analytics Workbook",
    type: "Material",
    source: "Marketing",
    level: "Practical",
    duration: "Workbook",
    description: "A guided workbook for campaign KPIs, conversion rates, attribution assumptions and reporting cadence.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/marketing-analytics-workbook/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=marketing-analytics-workbook"
  },
  {
    slug: "campaign-planning-toolkit",
    title: "Campaign Planning Toolkit",
    type: "Material",
    source: "Marketing",
    level: "Practical",
    duration: "Templates",
    description: "Reusable briefs, audience profiles, channel plans, content calendars and post-campaign reviews.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/campaign-planning-toolkit/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=campaign-planning-toolkit"
  },
  {
    slug: "ai-for-marketing-productivity",
    title: "AI for Marketing Productivity",
    type: "Learning path",
    source: "Marketing",
    level: "Intermediate",
    duration: "3 weeks",
    description: "Apply generative AI to research, ideation, content operations, personalisation and workflow automation.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/ai-for-marketing-productivity/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=ai-for-marketing-productivity"
  },
  {
    slug: "landing-pages-conversion-optimisation",
    title: "Landing Pages & Conversion Optimisation",
    type: "Course",
    source: "Marketing",
    level: "Advanced",
    duration: "9 hours",
    description: "Improve offer clarity, page structure, calls to action, experimentation and measurable conversion.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/landing-pages-conversion-optimisation/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=landing-pages-conversion-optimisation"
  },
  {
    slug: "marketing-campaign-practitioner",
    title: "Marketing Campaign Practitioner",
    type: "Badge pathway",
    source: "Marketing",
    level: "Applied",
    duration: "Evidence based",
    description: "Earn a Skunkworks Academy badge by submitting a campaign brief, assets, measurements and retrospective.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/marketing-campaign-practitioner/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=marketing-campaign-practitioner"
  },
  {
    slug: "ai-enabled-marketing-operations",
    title: "AI-Enabled Marketing Operations",
    type: "Badge pathway",
    source: "Marketing",
    level: "Advanced",
    duration: "Evidence based",
    description: "Demonstrate responsible AI usage, automation design, governance and measurable marketing outcomes.",
    overviewUrl: "https://marketing.skunkworksacademy.com/content/ai-enabled-marketing-operations/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=ai-enabled-marketing-operations"
  },
  {
    slug: "exchange-online-bulk-mail-management",
    title: "Microsoft Exchange Online Bulk Mail Management",
    type: "Course",
    source: "Microsoft",
    level: "Intermediate",
    duration: "Self-paced",
    description: "Design, govern, monitor and troubleshoot bulk email patterns in Exchange Online using distribution lists, TERRL awareness and safe external sending options.",
    overviewUrl: "https://portal.skunkworksacademy.com/courses/exchange-online-bulk-mail-management/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=exchange-online-bulk-mail-management"
  },
  {
    slug: "ai-tools",
    title: "Applied AI Tools",
    type: "Course",
    source: "Portal",
    level: "Short course",
    duration: "4 weeks",
    description: "Prompt workflows, responsible use, automation and workplace AI productivity.",
    overviewUrl: "https://portal.skunkworksacademy.com/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=ai-tools"
  },
  {
    slug: "cybersecurity",
    title: "Security Analyst Academy",
    type: "Course",
    source: "Portal",
    level: "Professional track",
    duration: "12 weeks",
    description: "Security fundamentals, labs, incident response and analyst capstone work.",
    overviewUrl: "https://portal.skunkworksacademy.com/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=cybersecurity"
  },
  {
    slug: "cloud",
    title: "Cloud Practitioner Track",
    type: "Course",
    source: "Portal",
    level: "Foundation",
    duration: "8 weeks",
    description: "Cloud fundamentals, deployment practice, troubleshooting and exam readiness.",
    overviewUrl: "https://portal.skunkworksacademy.com/",
    registerUrl: "https://portal.skunkworksacademy.com/register/?course=cloud"
  }
];

export function findRegistrationCourse(slug: string | null | undefined) {
  return registrationCourses.find((course) => course.slug === slug) ?? registrationCourses[0];
}

export function registrationCourseSlugs() {
  return registrationCourses.map((course) => course.slug);
}

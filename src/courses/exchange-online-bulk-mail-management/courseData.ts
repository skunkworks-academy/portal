export type CourseModule = {
  id: string;
  title: string;
  summary: string;
  outcome: string;
  lessons: CourseLesson[];
};

export type CourseLesson = {
  id: string;
  title: string;
  type: "lesson" | "lab" | "assessment";
  minutes: number;
  objectives: string[];
  summary: string;
  sections: Array<{ heading: string; body: string }>;
  checklist?: string[];
  commands?: Array<{ label: string; code: string }>;
};

export type CourseResource = {
  title: string;
  description: string;
  format: "worksheet" | "template" | "checklist" | "reference";
};

export type CourseQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

export const courseMeta = {
  slug: "exchange-online-bulk-mail-management",
  code: "M365-EXO-BMM-101",
  title: "Microsoft Exchange Online Bulk Mail Management",
  subtitle: "Guide and best practices for bulk email setup and sending using distribution lists",
  level: "Intermediate",
  duration: "8-10 hours",
  modality: "Self-paced web course",
  audience: "Microsoft 365 administrators, Exchange Online administrators, messaging engineers, IT operations leads and solution architects",
  badge: "Skunkworks Academy Exchange Online Bulk Mail Management Completion Badge"
} as const;

export const sourceReferences = [
  "Microsoft Learn: Exchange Online limits",
  "Microsoft Learn: Create and manage distribution groups in Exchange Online",
  "Microsoft Learn: Manage High Volume Email for Microsoft 365",
  "Microsoft Learn: Azure Communication Services Email overview",
  "Microsoft Defender for Office 365: SPF, DKIM and DMARC configuration guidance",
  "Skunkworks Academy unified navigation and portal shell"
];

export const courseModules: CourseModule[] = [
  {
    id: "m1-foundations",
    title: "Foundations: Bulk Mail in Exchange Online",
    summary: "Build the mental model for safe high-volume email in Microsoft 365.",
    outcome: "Classify internal announcements, application mail, operational notifications and external bulk workloads correctly.",
    lessons: [
      {
        id: "bulk-mail-operating-model",
        title: "Bulk mail operating model",
        type: "lesson",
        minutes: 25,
        objectives: [
          "Explain why Exchange Online distribution lists are not a universal bulk-mail platform",
          "Differentiate user mailbox sending, distribution list expansion, HVE and ACS Email",
          "Identify operational risks before sending to large recipient populations"
        ],
        summary: "This lesson positions Exchange Online as an operational messaging platform with limits, governance and deliverability constraints.",
        sections: [
          {
            heading: "Bulk mail is an architecture decision",
            body: "A distribution list may be the right tool for an internal announcement, but the wrong tool for a customer campaign. Learners start by classifying the workload before selecting technology."
          },
          {
            heading: "Recipient expansion changes risk",
            body: "A single visible distribution group can expand into thousands of recipients. That expansion affects delivery management, moderation, reporting and tenant-level outbound limits."
          }
        ],
        checklist: [
          "Identify sender, audience and business purpose",
          "Classify recipients as internal, accepted-domain or external",
          "Estimate frequency and total recipient volume",
          "Decide whether the message is transactional, operational or marketing-oriented"
        ]
      },
      {
        id: "architecture-decision-tree",
        title: "Architecture decision tree",
        type: "lesson",
        minutes: 30,
        objectives: [
          "Choose between distribution lists, HVE, ACS Email and specialist email platforms",
          "Recognize when external high-volume email should leave Exchange Online",
          "Document governance and approval points"
        ],
        summary: "A practical decision guide for choosing the correct sending path before any configuration work begins.",
        sections: [
          {
            heading: "Stay in Exchange Online when the use case is controlled",
            body: "Use distribution lists for governed internal or partner communications where senders, recipients and approval paths are known and auditable."
          },
          {
            heading: "Move to purpose-built services when the workload is high volume",
            body: "Use High Volume Email for internal application or device-generated mail. Use Azure Communication Services Email or a specialist provider for external application-to-person and commercial bulk communication."
          }
        ],
        checklist: [
          "Can this workload tolerate mailbox throttling?",
          "Will recipients be external after expansion?",
          "Is opt-out or suppression-list handling required?",
          "Does the organization need analytics beyond message trace?"
        ]
      }
    ]
  },
  {
    id: "m2-limits-terrl",
    title: "Exchange Online Limits and TERRL",
    summary: "Understand mailbox, message and tenant-level outbound controls.",
    outcome: "Calculate operational risk before a high-volume send and explain why TERRL affects distribution-list design.",
    lessons: [
      {
        id: "limits-that-matter",
        title: "Limits that matter",
        type: "lesson",
        minutes: 35,
        objectives: [
          "Explain recipient rate limits, message rate limits and recipient-per-message limits",
          "Describe how distribution groups are counted under different limit types",
          "Recognize onmicrosoft.com throttling risks"
        ],
        summary: "Learners map each Exchange Online limit to the operational symptom it creates.",
        sections: [
          {
            heading: "Mailbox limits are not tenant limits",
            body: "A mailbox-level limit controls what an individual sender can do. TERRL controls the tenant's external-recipient volume over a rolling 24-hour period. Both can matter during the same incident."
          },
          {
            heading: "Counting differs by control",
            body: "Directory distribution groups can be treated as one recipient for one rule while expanded external recipients still affect tenant-level external recipient volume."
          }
        ],
        checklist: [
          "Estimate daily external-recipient volume",
          "Check whether the sender uses the default tenant domain",
          "Inspect distribution group membership and nested membership",
          "Confirm whether the send is recurring or one-off"
        ]
      },
      {
        id: "terrl-impact-simulator",
        title: "TERRL impact simulator",
        type: "lab",
        minutes: 40,
        objectives: [
          "Calculate recipient expansion impact",
          "Compare mailbox-level counting with tenant-level counting",
          "Prepare an escalation note for a send that could exceed limits"
        ],
        summary: "Learners model how a large group send affects external-recipient capacity over a sliding 24-hour window.",
        sections: [
          {
            heading: "Scenario",
            body: "An operations team wants to send an urgent advisory to a mixed distribution group with internal users, accepted-domain partners and external customers. Learners classify each recipient group and calculate risk."
          },
          {
            heading: "Expected decision",
            body: "If the external volume is high, the learner should move the send to an approved external bulk-mail path or segment the message with explicit monitoring and approval."
          }
        ],
        checklist: [
          "Count internal recipients separately from external recipients",
          "Record expected external expansion",
          "Check the tenant's current outbound external recipient usage",
          "Define stop/go criteria before release"
        ]
      }
    ]
  },
  {
    id: "m3-distribution-lists",
    title: "Distribution List Design and Governance",
    summary: "Create safe, maintainable and auditable recipient structures.",
    outcome: "Design distribution groups with ownership, approval, delivery restrictions and periodic review.",
    lessons: [
      {
        id: "dl-design-patterns",
        title: "Distribution list design patterns",
        type: "lesson",
        minutes: 30,
        objectives: [
          "Choose between static distribution groups, dynamic distribution groups and mail-enabled security groups",
          "Define ownership and sender permissions",
          "Set review criteria for large or sensitive groups"
        ],
        summary: "Good recipient design reduces accidental blasts, unauthorized sending and troubleshooting complexity.",
        sections: [
          {
            heading: "Ownership is not optional",
            body: "Every high-impact group should have a named business owner, a technical owner, and a review cadence. Groups without owners become unmanaged blast-radius objects."
          },
          {
            heading: "Large groups need release controls",
            body: "When membership grows, add delivery management, moderation, message-size discipline and stronger change control."
          }
        ],
        checklist: [
          "Assign owners and backup owners",
          "Restrict senders where practical",
          "Use moderation for sensitive or large groups",
          "Document purpose, scope and expiry/review date"
        ]
      },
      {
        id: "dl-powershell-runbook",
        title: "Distribution list PowerShell runbook",
        type: "lab",
        minutes: 45,
        objectives: [
          "Inspect large distribution group membership",
          "Export recipients for review",
          "Validate delivery management and moderation settings"
        ],
        summary: "A practical admin runbook for inspecting large groups when the UI is not enough.",
        sections: [
          {
            heading: "Why PowerShell matters",
            body: "Very large groups are operationally easier to audit and validate through PowerShell because admins can export, filter and compare results consistently."
          }
        ],
        commands: [
          {
            label: "Connect to Exchange Online",
            code: "Connect-ExchangeOnline -UserPrincipalName admin@contoso.com"
          },
          {
            label: "Inspect group controls",
            code: "Get-DistributionGroup -Identity 'All-Staff' | Format-List DisplayName,AcceptMessagesOnlyFromSendersOrMembers,ModerationEnabled,ManagedBy"
          },
          {
            label: "Export members",
            code: "Get-DistributionGroupMember -Identity 'All-Staff' -ResultSize Unlimited | Select-Object Name,PrimarySmtpAddress,RecipientType | Export-Csv .\\all-staff-members.csv -NoTypeInformation"
          }
        ]
      }
    ]
  },
  {
    id: "m4-deliverability",
    title: "Authentication and Deliverability",
    summary: "Protect sender reputation and align domains before operational or bulk sending.",
    outcome: "Plan SPF, DKIM, DMARC and subdomain strategy for safer mail flow.",
    lessons: [
      {
        id: "sender-authentication",
        title: "SPF, DKIM, DMARC and subdomain strategy",
        type: "lesson",
        minutes: 35,
        objectives: [
          "Explain what SPF, DKIM and DMARC validate",
          "Use subdomains to separate user mail from service-driven mail",
          "Define an authentication verification checklist"
        ],
        summary: "Authentication is a bulk-mail control because it affects reputation, spoofing resistance and delivery outcomes.",
        sections: [
          {
            heading: "Domain alignment controls trust",
            body: "SPF validates allowed sending infrastructure, DKIM validates cryptographic signing, and DMARC checks visible-domain alignment. The course treats these as an integrated control set."
          },
          {
            heading: "Subdomains reduce blast radius",
            body: "Service-driven or campaign-style mail should use a dedicated subdomain so reputation problems do not damage the primary user-mail domain."
          }
        ],
        checklist: [
          "List every authorized sender for the domain or subdomain",
          "Enable DKIM signing for custom domains",
          "Publish a DMARC policy and monitor aggregate reports",
          "Separate customer-facing or application mail from primary user mail where practical"
        ]
      }
    ]
  },
  {
    id: "m5-monitoring",
    title: "Monitoring and Troubleshooting",
    summary: "Use reports, message trace and operational evidence to detect risk early.",
    outcome: "Build a monitoring workflow for high-volume sending and failed delivery incidents.",
    lessons: [
      {
        id: "monitoring-runbook",
        title: "Monitoring runbook",
        type: "lesson",
        minutes: 35,
        objectives: [
          "Locate the relevant mail-flow and outbound-recipient reports",
          "Distinguish throttling, moderation, authentication and routing symptoms",
          "Escalate with evidence rather than assumptions"
        ],
        summary: "Learners build an evidence pack for high-volume incidents.",
        sections: [
          {
            heading: "Start with the symptom",
            body: "NDRs, blocked recipients, delayed moderation, failed authentication and external-recipient saturation require different troubleshooting paths."
          },
          {
            heading: "Use reports and trace together",
            body: "Reports show trends and thresholds. Message trace confirms what happened to specific messages and recipients."
          }
        ],
        checklist: [
          "Capture time range and sender identity",
          "Capture target group and expanded recipient count",
          "Check outbound external recipient usage",
          "Run message trace for representative failures",
          "Record NDR codes and exact timestamps"
        ]
      }
    ]
  },
  {
    id: "m6-capstone",
    title: "Capstone: Bulk Mail Architecture Review",
    summary: "Design a safe messaging pattern for three business workloads.",
    outcome: "Submit an architecture decision record, risk matrix and monitoring plan.",
    lessons: [
      {
        id: "capstone-brief",
        title: "Capstone brief",
        type: "assessment",
        minutes: 60,
        objectives: [
          "Select the right sending path for internal, device-generated and external workloads",
          "Document limits, controls and monitoring evidence",
          "Produce a release-ready governance recommendation"
        ],
        summary: "The final exercise turns configuration knowledge into architectural judgment.",
        sections: [
          {
            heading: "Scenario A: HR internal announcement",
            body: "Design a controlled internal announcement pattern using distribution lists, approved senders and moderation where required."
          },
          {
            heading: "Scenario B: Device-generated operational alerts",
            body: "Decide whether High Volume Email or an authenticated relay pattern is more appropriate for internal alert traffic."
          },
          {
            heading: "Scenario C: External customer notification",
            body: "Select a purpose-built external email path and define authentication, opt-out, analytics and escalation requirements."
          }
        ],
        checklist: [
          "Complete the decision matrix",
          "Complete the risk register",
          "Define sender authentication controls",
          "Define monitoring and escalation steps",
          "Pass the final knowledge check"
        ]
      }
    ]
  }
];

export const courseResources: CourseResource[] = [
  {
    title: "Bulk Mail Decision Guide",
    description: "One-page decision matrix for DL, HVE, ACS Email and specialist bulk platform selection.",
    format: "worksheet"
  },
  {
    title: "Distribution List Governance Checklist",
    description: "Operational checklist for owners, permitted senders, moderation, review cadence and change control.",
    format: "checklist"
  },
  {
    title: "Recipient Expansion Worksheet",
    description: "Worksheet for estimating internal, accepted-domain and external recipient expansion before release.",
    format: "worksheet"
  },
  {
    title: "Sender Authentication Worksheet",
    description: "Template for SPF, DKIM, DMARC and subdomain-readiness review.",
    format: "template"
  },
  {
    title: "Monitoring and Escalation Runbook",
    description: "Incident evidence pack template for NDRs, throttling, message trace and external-recipient usage.",
    format: "template"
  }
];

export const finalAssessment: CourseQuestion[] = [
  {
    id: "q1",
    prompt: "A single message is sent to a distribution group that expands to many external recipients. What is the main TERRL risk?",
    options: ["The sender's mailbox size increases", "Expanded external recipients can consume tenant external-recipient capacity", "The group owner is automatically removed", "DKIM is disabled"],
    answer: "Expanded external recipients can consume tenant external-recipient capacity",
    explanation: "TERRL is tenant-level and counts external recipients over a rolling window. Expanded distribution group members can therefore matter even when the visible recipient is one group."
  },
  {
    id: "q2",
    prompt: "Which workload is the best fit for Microsoft 365 High Volume Email?",
    options: ["External newsletter campaign", "Internal application or device-generated mail", "Cold outreach to purchased lists", "Consumer marketing automation"],
    answer: "Internal application or device-generated mail",
    explanation: "HVE is positioned for internal high-volume application or device mail rather than external bulk campaigns."
  },
  {
    id: "q3",
    prompt: "Why should a dedicated subdomain be considered for bulk or service-driven mail?",
    options: ["It removes all recipient limits", "It avoids all moderation", "It reduces reputation blast radius for the primary user-mail domain", "It makes message trace unnecessary"],
    answer: "It reduces reputation blast radius for the primary user-mail domain",
    explanation: "A subdomain helps separate the reputation and authentication posture of service-driven mail from normal user mail."
  },
  {
    id: "q4",
    prompt: "What should a large distribution group have before broad use?",
    options: ["No owners", "Open sending from any external sender", "Delivery management, ownership and review controls", "A disabled moderation workflow"],
    answer: "Delivery management, ownership and review controls",
    explanation: "Large groups create broad blast radius and need ownership, approval and sender-control discipline."
  },
  {
    id: "q5",
    prompt: "Which evidence is most useful when troubleshooting suspected throttling or blocking?",
    options: ["Only the sender's opinion", "Message trace, NDR code, sender, time range and recipient count", "A screenshot of Outlook only", "The group display name only"],
    answer: "Message trace, NDR code, sender, time range and recipient count",
    explanation: "Operational escalation needs evidence that identifies time range, sender, recipient expansion and exact failure behavior."
  }
];

export function allLessons() {
  return courseModules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id, moduleTitle: module.title })));
}

export function findLesson(lessonId: string) {
  return allLessons().find((lesson) => lesson.id === lessonId);
}

export function courseCompletionCriteria() {
  const lessons = allLessons();
  return {
    requiredLessons: lessons.map((lesson) => lesson.id),
    requiredAssessmentScore: 80,
    badge: courseMeta.badge
  };
}

# Skunkworks Academy LMS + Microsoft Marketplace | 14 December 2026

**Status:** Implementation baseline. This document is not evidence of live Entra provisioning, Microsoft 365 entitlement, payment processing or deployed LMS services.

**Primary identity tenant:** SKUNKWORKS, `skunkworks.digital` (`338a8916-80d9-467c-a94a-7f61d04ef7d5`).
**Existing portal application:** `Skunkworks Academy Portal`, client ID `e22672ae-61a6-434e-b135-3360557819ec`.
**Initial codebase:** `skunkworks-academy/portal` (React/Vite + Azure Functions + Graph/SharePoint).
**Customer-facing destination:** `https://portal.skunkworksacademy.com/`.
**Microsoft Marketplace target:** 14 December 2026.

## 1. Identity is not a licence

1. Use the existing portal as the sign-in front door. The browser currently authenticates through Microsoft Entra using the `/common` authority, while the home tenant is fixed in configuration and server-side staff privilege checks. Keep the unsigned-in experience a login landing page.
2. `skunkworks.digital` is the *home Entra tenant* for the existing portal app and privileged operational identities. GitHub owner names, including `skunkworks-africa`, are **not Microsoft tenants** and must not be used as tenant-selection logic.
3. Model identity as `(issuer, tenantId, subject/objectId)` and Academy membership as `(academyOrganizationId, userId, roles)`. A user's Microsoft tenant does not necessarily equal their customer organisation. Do not trust client-side role switches.
4. Open learner and customer SSO can accept eligible Microsoft work/school or personal accounts through a supported identity architecture, but external users must never inherit home-tenant `Portal.Admin` or `Portal.Staff` permissions. Finalise whether to use an Entra External ID external tenant or another supported external identity path before public registration.
5. The Microsoft 365 Education subscription is **not** the Marketplace SaaS subscription and is **not** granted by Microsoft sign-in. Verify institutional eligibility, available licence inventory, service-plan terms, usage location and approval before provisioning. Where permitted, implement authorised group-based licence assignment with audit records and a separate revocation workflow. No automatic Education licences for arbitrary public accounts.
6. The existing `azure/portal-entra-contract.json` says `userAssignmentRequired: false`; the setup guide says its application script enables assignment-required. Resolve this configuration conflict in staging before applying any Entra changes. Self-service student sign-up and assigned staff access need separate explicit policies.

## 2. LMS role workspaces

| Role | Launch functions |
|---|---|
| Learner | Learning dashboard, enrolments, lessons, video/PDF resources, MCQ attempts, progress, certificates, live class schedule, Skunkie, careers, badges, labs, community discovery |
| Instructor | Enrolled learning, assigned cohorts, approved authoring/publishing, lesson/media/assessment drafts, moderation, class attendance, instructor job applications |
| Staff / coordinator | Course and programme administration, moderation and QA, public cohort calendar, staff schedule, student/instructor management, assessments and content release approvals |
| Customer organisation admin (SaaS) | Seats, learner invites, scoped course catalogue, licence/entitlement summary, reporting, branding and tenant-specific policies |
| Platform admin | Multi-tenant support, audit, plans, integrations, service and cost limits; access requires server-verified home-tenant app role |

**Publication flow:** Draft → content checks → editorial review → commercial review → QA → approved → published → archived. Existing `api/coursePublication.ts` default-deny release governance must not be bypassed by the future authoring UI.

**Content objects:** `Organisation, UserIdentity, Membership, Course, CourseVersion, Module, Lesson, MediaAsset, QuestionBank, QuestionVersion, Assessment, Attempt, AttemptAnswer, Enrolment, LessonProgress, Cohort, Timetable, Attendance, Certificate, BadgeEvidence, Subscription, Entitlement, AuditEvent`.

- Lessons support ordered video, PDF, rich text and download resources. Store media in private object storage with signed, time-limited access; do not store student PII in a public GitHub Pages repository.
- MCQ question banks need answer versioning, randomisation rules, time limits, accessibility checks, pass thresholds, retry policies and server-side scoring. Instructor preview must never leak answer keys to students.
- Progress events and assessment attempts must be persisted server-side, with idempotency keys, timestamps, learner ownership checks and immutable result history.
- SCORM 1.2/2004 import and xAPI/LRS compatibility are later milestones, not implied by generic document upload.

## 3. One Academy, multiple connected products

Use `src/academy-service-registry.ts` as initial frontend metadata. It deliberately separates known source-configured destinations from not-yet-connected functionality.

| Destination | Role in LMS | Integration contract |
|---|---|---|
| `portal.skunkworksacademy.com` | Role-based home and learning progress | Entra SSO, own user/membership and entitlement API |
| `careers.skunkworksacademy.com` | Career assessment, development plans, job applications and digital footprint | Shared signed subject mapping; scoped career record API; consent and review |
| `badging.skunkworksacademy.com` | Badges and upskilling evidence | Badge issuer verification, credential status and verification URLs |
| Academy community | Discussion, study groups, instructor mentorship | Not yet source-verified as a separate host: do not invent its URL |
| `labs.skunkworksacademy.com` | Rent labs by minute/hour; Azure/GCP environments | Authorised lab control API, quota, policy, cost ledger and expiry |
| IBM, Microsoft, Google, CompTIA catalogues | Vendor-specific pathways and authorised course listings | Sync catalogue IDs/versions; partner approval/brand checks; enrolment mapping |
| Microsoft 365 web / Teams | Licensed productivity and class collaboration | Link only; do not promise app access until tenant licensing and service plans are confirmed |

The Careers repository currently contains a Next.js MVP that stores candidate registration drafts in browser local storage; do not treat this as a durable production identity or candidate database. The Labs repository includes a public catalogue and control-plane OpenAPI outline; do not assume the production provisioning API is deployed.

## 4. On-demand lab rental control plane

`Reserve → Authorise + capture entitlement → Provision → Ready → Active → Stop/Expire → Teardown → Reconcile`.

- Provision resources using **Azure Resource Manager** and, where supported, **Google Cloud Platform** workload APIs. Google Workspace productivity licences are not interchangeable with Google Cloud compute resources.
- Each lab session requires `academyOrganizationId`, `learnerId`, `labTemplateVersion`, provider, allowed region, cost ceiling, idle timeout, maximum duration, provisioning request ID and resource tags.
- Meter actual usage from a durable provider-aligned ledger; support minute/hour billable units, minimum charges only when disclosed, prepaid funds or Marketplace entitlements, and dispute reconciliation.
- Enforce account budgets, regional quotas, approved VM shapes, network egress restrictions, deny public management ports, managed identity/service accounts, ephemeral secrets, sandbox isolation, auto-stop, auto-destroy and orphan detection.
- A scheduled sweeper must delete expired labs even when browser sessions disappear; log lifecycle, provider costs and customer charges separately. Do not start billed resources before authorisation.

## 5. Microsoft Marketplace SaaS integration

The Academy LMS SaaS offer must integrate with **Microsoft Marketplace SaaS Fulfillment APIs v2** and server-side webhook processing, independently of education licences.

1. Customer purchases the offer and lands on an authenticated fulfilment flow (or receives an auto-activation notification, depending on configured plan).
2. Backend resolves the purchase where required; deduplicates by Microsoft subscription ID; binds purchase to a new or existing Academy customer organisation.
3. Validate purchased plan and seats, provision the tenant configuration and entitlement, and then activate the subscription when manual activation is configured.
4. Process plan change, seat quantity, suspension, reinstatement, cancellation and trial events through validated webhook operations and idempotent retries. Never treat a browser callback alone as proof of purchase.
5. Provide a customer admin console and clear service suspension semantics; keep subscriptions, Education licences and lab usage billing in distinct ledgers.

Microsoft references:
- https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-apis
- https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-webhook
- https://learn.microsoft.com/en-us/entra/identity/users/licensing-admin-center
- https://www.microsoft.com/en-za/education/products/office

## 6. Platform topology and risk controls

```text
Public Academy sites and catalogues
       │
Portal login (Microsoft Entra / BFF)
       │ verified subject + org membership
       ▼
Tenant-aware API gateway and authorisation
       ├── LMS API (courses, versions, attempts, progress)
       ├── Careers + credentials integration
       ├── Community + Skunkie (retrieval, safeguards, consent)
       ├── Labs control + metering (ARM/GCP)
       ├── Marketplace fulfillment + billing entitlements
       └── Microsoft Graph / Teams / SharePoint connector
              │
    Data: tenant-scoped SQL + private media blob store + audit events
```

Baseline: Azure Functions/App Service for APIs as appropriate; Azure SQL or equivalent relational tenant-scoped data store; Blob Storage for assets; Key Vault, managed identities, Application Insights, a queue for provisioning/background jobs. Deploy staging independently from production and enforce authorisation *on every API request*. Skunkie may propose lesson scaffolds and study plans; instructors approve publishable content, and assessment integrity rules restrict answer disclosure.

## 7. Launch sequence and exit criteria

- **30 Oct–8 Nov:** tenant/app inventory; resolve role-assignment conflict; domain model and migrations; clickable student/instructor/staff navigation; privacy/consent requirements; confirm licensing pathway.
- **9–22 Nov:** course CRUD, structured uploads, video/PDF player, question bank + scored MCQs, enrolment and progress persistence; instructor content moderation.
- **23 Nov–4 Dec:** staff schedules and public timetable, customer organisation onboarding, Microsoft Marketplace sandbox fulfilment and webhook flows, Skunkie guarded study assistant, badge/career handoffs.
- **5–11 Dec:** smoke/integration/security/tenant-isolation/role-accessibility tests; customer trial journeys; live deployment rollback, monitoring, cost caps and billing reconciliation.
- **12–13 Dec:** production readiness sign-off, pilot users, offer certification evidence, contingency rehearsal.
- **14 Dec:** target SaaS offer launch **only when** Partner Center certification, entitlement reconciliation, sign-in and operational acceptance checks pass.

**Blocking checks:** No cross-tenant data leak; no unauthorised course publishing; no student access to assessment answer keys; no entitlement without validated commerce; no Education auto-licensing without verified eligibility; no unattended billed lab; no unauthorised staff role; no credentials in frontend; session expiry and revocation verified.

## 8. Implementation status at this checkpoint

- Existing portal uses `skunkworks.digital` canonical home tenant in `src/authConfig.ts` and `azure/portal-entra-contract.json`; this is repository-source verification, **not live directory enumeration**.
- New proposed enterprise app contract lives in `azure/academy-lms-enterprise-applications.json`; it is intentionally non-executing.
- Service registry and test cover known external destinations and mark community and the future embedded LMS as planned.
- Student, instructor and staff workspaces now expose configured Academy destinations from the shared registry on the feature branch.
- **Not yet built**: LMS data persistence and assessment engine; secure cross-site subject tokens; actual labs provisioning; marketplace webhook billing; Entra app provisioning; verified education licence fulfilment.

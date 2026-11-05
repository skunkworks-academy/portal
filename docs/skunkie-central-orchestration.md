# Skunkie central orchestration — Networking Basics slice

Skunkie is the first student view after the existing Microsoft sign-in. The long-term flow is collect → aggregate → assess → orchestrate → learn/build → evaluate → adapt. This change implements a bounded text-based Networking Basics path inside the existing portal, rather than creating a second learning platform.

## Implemented behaviour

1. `StudentExperience` starts and resets to Skunkie for the signed-in student. Dashboard, LMS, assessment preferences and other navigation remain available.
2. Azure Functions verifies the Microsoft access token and the current home-organization boundary before loading any records. Browser account fields, email, goals and answers do not establish identity or grant access.
3. The context service reads published Cosmos LMS courses, actual per-learner LMS enrolments, explicit curriculum bindings, prior diagnostic sessions and evaluated outcomes. It returns only currently accessible course sessions.
4. A learner chooses an enrolled course, supplies a goal, answers three original knowledge questions and consents to account storage. The server grades the answers. Self-reported confidence is never treated as demonstrated capability.
5. The implemented Networking specialist chooses a demonstrated gap, or rotates to the next skill after successful practice. It assembles an original structured activity using the saved preference questionnaire's approach/session budget, real lesson mapping, current LMS completion count and previous practice evidence. Goals are stored as learner context, not executed as instructions. This release does not interpret an arbitrary goal into new curriculum.
6. The follow-up check is evaluated on the server. The first submission is saved immutably per session; retries return the stored result. Diagnostic sessions are immutable UUID records, avoiding a shared mutable progress array. Curriculum version/mapping and context provenance are saved with the session.
7. Results reload from the durable store. Practice outcomes are separate from LMS lesson completion and credentials; this service never marks a lesson/course complete or issues a certificate.
8. Staff can connect the reviewed Networking Basics lessons through **Academy course governance → selected published course → Connect Networking Basics to Skunkie**. The API verifies staff roles and that each chosen lesson belongs to that course. Saving replaces that course's current mapping.

The registered Networking specialist owns question generation, scoring, activity assembly and evaluation. Other named specialists are `planned`, without callable tools. Networking has an empty tool allowlist. Structured activity content renders through React text nodes; no generated HTML is executed.

## Existing curriculum connection

The Academy's existing [Cisco catalogue](https://github.com/skunkworks-academy/www/blob/main/enrol/cisco/courses.json) lists **Networking Basics**. Source blob inspected: `34f4f63bf16b9dafd75cc3bc93b37159cf38223a`, catalogue refreshed 2026-08-23. Luca selected Networking Basics as the pilot on 5 November 2026.

This catalogue is an offering list, not proof of a student's enrolment or access to Cisco material. The portal's separate SharePoint checkout enrolments are not silently migrated into Cosmos LMS enrolments by this change. The first slice uses the existing authenticated Cosmos LMS domain. Staff must connect the actual published course and real lesson IDs, and verify the pilot student's LMS enrolment. No guessed course IDs, synthetic production courses or vendor content were inserted. The short practice explanations/questions are original supplementary material, not imported Cisco courseware. Staff should review them alongside the licensed curriculum before rollout.

## API and storage

| Method and route under `/api` | Purpose |
| --- | --- |
| GET `/me/skunkie/context` | Current learner's accessible Networking courses, public diagnostic questions, sessions and outcomes |
| POST `/me/skunkie/networking/assess` | Validate consent, verify course access, grade diagnostic, assemble and save activity |
| POST `/me/skunkie/sessions/{sessionId}/evaluate` | Recheck access, grade follow-up, save first outcome |
| PUT `/staff/skunkie/curriculum/{courseId}` | Staff mapping of three skills to genuine course lessons |

Assessment payload: `{ courseId, goal, answers: { questionId: optionIndex }, consentToStore: true }`.
Evaluation payload: `{ answer: optionIndex }`. Client-supplied scores/correctness are ignored.
Mapping payload: `{ companionId: "networking", catalogueTitle: "Networking Basics", version: 1, lessonIds: { addressing, switching, troubleshooting } }`.

Uses existing `LMS_COSMOS_ENDPOINT`, `LMS_COSMOS_DATABASE`, `LMS_COSMOS_CONTAINER`, `LMS_HOME_ORGANIZATION_ID`, `ENTRA_TENANT_ID` and the Function's managed identity. No new provider, dependency, secret or paid Azure resource is required by this slice.

Collections: `skunkieCurriculum-v1` under organization/course keys; `skunkieSessions-v1` and `skunkieOutcomes-v1` under organization/verified-subject/session keys. Existing preference assessment is read from `skunkie-assessment-v1`. Never put learner records in GitHub. Session records retain goals and derived results, not full questionnaire notes. Deleting the preference questionnaire currently does not delete these separate learning records; a complete learner export/deletion/retention workflow is outstanding before wider commercial rollout.

## Verification on 5 November 2026

- `npm test`: 125 tests passed across 28 files, including new domain and HTTP boundary tests.
- `npm run build`: passed, including global navigation validation.
- `npm run build:api`: passed.
- Local Edge browser acceptance with a synthetic MSAL provider, intercepted API transport and the actual orchestration domain: goal/diagnostic → activity → evaluation → reload; service failure/retry; revoked enrolment hides sessions. No production identity bypass or fixture is shipped.
- Desktop and 390px mobile visually inspected; mobile form sizing corrected and no horizontal page overflow. No page errors. Screenshots/local harness are in ignored `artifacts/`.
- Existing public production `/api/health` returned `ok=true`, `lmsSettings.configured=true`, `skunkieSettings.configured=false`. This checks configuration presence, not Cosmos connectivity, enrolment contents or authenticated acceptance.
- No production learner data was read/created, no Azure configuration changed, no new provider activated. Real Microsoft sign-in → deployed Skunkie → durable Cosmos cross-device reload remains to be verified in staging.

## Rollout sequence

1. Review the original practice content and current course/lesson mappings with the Networking instructor.
2. Deploy the API from this branch to the existing staging Function environment with managed-identity Cosmos access, using the repository's established deployment process. Deploy the matching frontend to staging. Do not run infrastructure provisioning just to publish this code.
3. Sign in as staff and map the actual published Networking Basics lessons. Sign in as a synthetic student with an existing active LMS enrolment. Verify a second student's isolation, missing/revoked access, expiry/re-authentication, storage failures and cross-device reload against real Cosmos.
4. Confirm whether commercial/SharePoint enrolments must synchronize into the LMS. Implement an identity/tenant-verified adapter before promising that checkout enrolments work in this path. Never auto-grant access merely from matching titles or email addresses.
5. Deploy API first, then frontend through the existing GitHub/Azure release workflows after staging acceptance. The frontend will otherwise report unavailable for missing routes. Retain the previous deployment for rollback.
6. Verify the production Microsoft login round trip and first Skunkie view. Rollback: restore previous frontend/API commits; no existing LMS records were migrated or rewritten.

## North-star extensions within Microsoft and GitHub

Keep the orchestration service as the authority for authenticated context, permitted specialists and tool decisions. Expand the registry with explicit versions, supported modalities, required entitlements, approved curriculum sources, assessor/evaluator contracts and allowed tools. Register a specialist only when its handler and evaluation criteria exist.

- **Collectors:** versioned text/voice/image inputs with consent, MIME/size checks, private Blob storage, malware scanning and retention. Use approved Azure speech/vision services behind managed identities. Treat transcripts/OCR/documents as untrusted evidence with source provenance; they cannot alter tool permissions.
- **Aggregators:** tenant membership, identity-bound commercial/LMS enrolments, preferences, course objectives, learner-authorized evidence and evaluated outcomes. Use bounded snapshots with versions; do not send the entire private profile to a model by default.
- **Assessors:** source-specific rubrics and uncertainty, separate self-reports from observed evidence, human escalation, accessible alternate tasks, and calibrated evaluations. Three multiple-choice questions are limited practice evidence, not an aptitude judgement.
- **Orchestrator:** select an implemented specialist using authorized curriculum and assessed need. Use durable work items with idempotency, timeouts, cancellation, budgets and audit events before adding asynchronous tools. Existing Azure OpenAI tutoring can later receive a minimal authorized context snapshot after its configuration/data flow is reviewed and tested.
- **Lesson/interface generation:** retrieve authorized curriculum; emit validated structured lesson data rendered by trusted components. If HTML becomes necessary, isolate it on a separate sandboxed origin without portal tokens or unrestricted network access; never inject arbitrary model HTML into the portal.
- **Approved GitHub workspaces:** generate a reviewable workspace request first; verify organization, course entitlement, explicit approval, repository template, permissions, budget and expiry in the backend. Use a narrowly scoped GitHub App, restricted Codespaces/devcontainer template and cleanup workflow. A learner prompt or specialist response alone must never provision resources or grant repository access.
- **Evaluators:** append evaluated outcomes with rubric/model versions and evidence provenance, support instructor correction, and re-plan from demonstrated learning. Preserve credential/course-completion authority in the LMS.

## Microsoft Marketplace scope

Microsoft Marketplace does not require every SaaS component to be a Microsoft product. This project nonetheless deliberately stays with the Academy's existing Microsoft/GitHub environment as requested.

This slice is not a certified or transactable Marketplace offer. [Microsoft's SaaS planning requirements](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/plan-saas-offer) distinguish listing models. For a transactable SaaS offer, add a separate buyer onboarding landing page, Entra/MSA buyer sign-in, SaaS Fulfillment API integration and connection webhook; validate subscription changes before changing entitlements. Keep the buyer onboarding page separate from the signed-in learner's Skunkie landing view. [SaaS Fulfillment APIs](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-apis) govern commercial subscription lifecycle, not assessment scoring.

The current home-tenant-only LMS restriction is intentionally retained; authenticated external tenants/personal accounts require deliberate organization membership and subscription provisioning before access. Multi-tenant isolation, subscription suspension, seat assignment, privacy/retention, operational limits, accessibility and offer certification remain release work. No Marketplace listing/submission is made by this change.

# AI course publication, entitlement and release governance

The canonical discovery catalogue lives in [course-catalog](https://github.com/skunkworks-academy/course-catalog/blob/main/static/ai-master-catalog.json). The Portal's **server-side** `api/coursePublication.ts` is the authorization boundary for checkout and enrolment. Browser flags, query parameters and the public catalogue are not evidence of approval.

## Initial baseline

- Eight existing Portal courses retain their historical production allowlist. This is an inherited operational status, **not** certification that their commercial/editorial records have been re-reviewed.
- All 19 generated AI foundation curricula stay in `review` / `enquiry-only` status. Seven additional discovery resources or learning offerings in the catalogue are not automatically authorized by the Portal.
- No new AI ID may be enabled by copying a static link or changing a client-side JSON file.

## Required per-course human approval

1. **Editorial**: assigned subject-matter expert reviews factual accuracy, current vendor documentation, outcomes, modules, accessibility, labs and assessments. Record an immutable evidence link and named reviewer.
2. **Quality/security**: QA validates responsive views, content security, WCAG contrast, automated builds, negative cases and assessment integrity. Record test run and reviewer approval.
3. **Commercial**: authorized business owner approves tuition, VAT/invoicing, refund/expiry terms, reseller constraints and vendor trademark/certification representations. Record authorization.
4. **Publication**: owner confirms course ID, canonical URL, controlled content storage, course-specific entitlement scope and rollback plan. Set `status: 'published'` with complete `approval` in the server registry only after independent approvals. Changes require protected branch review.
5. **Release**: verify Portal API and catalogue sync, checkout callbacks, authentication (Entra), learner-specific entitlement, access denial after expiry/refund/cancellation and a complete audit trail in staging. Only then deploy production and mark public enrolment status approved.

Evidence values must reference actual approved records. Never invent or batch-populate approvals.

## Data contract

Read-only: `GET /api/course-publication`. Returns schema `skunkworks-academy/course-publication/v1` and statuses for 27 records, with `Cache-Control: no-store`.

Canonical validation: `npm run validate:ai-publication -- --remote` compares all 19 generated IDs/titles against `course-catalog/main`, fails on unknown, added or improperly published entries, and runs in CI. A status export is informational; server-side `requireCourse()` and `resolveCourseAccess()` decide authorization separately.

Subscription compatibility: historical Academy membership plans can grant access only when enrolment and paid entitlement share **the same plan and learner email** and the grant is Active with a future valid expiry. Newly approved generated AI courses **cannot** inherit membership rights: they require both an explicit `academy.course.<COURSE_ID>` entitlement scope and a matching `CourseId` on the server grant. Payment transactions and entitlements must match when linked.

## Prohibited shortcuts

- Granting access based on an arbitrary `courseId` supplied by a form or success URL.
- Treating a browser token, localStorage flag, registration form or receipt screen as a subscription grant.
- Delivering confidential lesson bodies inside GitHub Pages public source or client JavaScript bundles. GitHub Pages is not a secure content store. Move protected content behind an authenticated API before claiming confidentiality.
- Increasing visual regression tolerance or declaring tests successful when screenshots diverge without independent inspection.

## Runbook

`npm ci && npm test && npm run validate:ai-publication -- --remote && npm run build:api`

In staging, test denied, expired, suspended, refunded, cancelled, wrong-learner, unknown and unapproved course IDs. Validate payment provider webhooks in sandbox before live charging. Do not test real payments in production without explicit commercial approval.

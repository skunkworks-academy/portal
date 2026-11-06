# Skunkworks Academy Portal — Phase 2 authenticated LMS workspaces

## Delivered vertical slice

The Portal now displays a real Azure Cosmos DB-backed LMS in the signed-in Student and Instructor/Staff React workspaces. This is an integration of the existing `api/lmsDomain.ts`, `api/lmsFunctions.ts`, and `api/lmsCosmosStore.ts` implementation, **not** a demonstration dataset.

### Student

- View only **published** courses from the verified LMS organisation.
- Enrol through `POST /api/lms/courses/:id/enrol` (authenticated, server-side, idempotent).
- Review only the signed-in learner's enrolments via `GET /api/lms/me/enrolments`.
- View lesson titles and media types **only after enrolment** via `GET /api/lms/courses/:id/lessons`; no storage key, asset URL or answer key is returned.
- Mark a real lesson completed, retrieve per-course progress and show a lesson count grounded in persisted records. Never infer a percentage from course-count estimates.
- Show explicit no-data, access-not-provisioned and storage-unavailable states. An external Microsoft account can still log in to the Portal but cannot access organisation LMS data until membership is verified and provisioned.

### Instructor / Staff

- Create durable draft courses, subject to home-tenant Entra instructor/staff role validation.
- Submit drafts for review; staff can publish only reviewed courses.
- View authorised draft and published lesson metadata, and add a PDF/video lesson record referencing an existing private Blob key (validated by the API; **this does not upload the blob or make it downloadable**).
- Instructor ownership is enforced server-side. Staff actions require an assigned home-tenant `Portal.Staff` or `Portal.Admin` app role.

## Security and data rules

- `api/lmsFunctions.ts` requires verified Microsoft access tokens; the organisation remains explicitly the home tenant until a trusted multi-organisation membership model is deployed.
- The Cosmos adapter is configured with `LMS_COSMOS_ENDPOINT`, `LMS_COSMOS_DATABASE`, `LMS_COSMOS_CONTAINER`, `LMS_HOME_ORGANIZATION_ID`. Credentials are acquired through `DefaultAzureCredential` and managed identity. There is no in-memory production fallback.
- No client-provided tenant, subject, organisation ID or role is trusted.
- Do not migrate protected lessons into GitHub Pages, and do not return Blob storage keys/assessment answer keys from list routes.
- Account switching clears loaded LMS records. UI controls are not authorization; all read/write operations are revalidated on the API.

## Not yet implemented or verified

1. Private file upload and user-authorized download/playback from Azure Blob / SharePoint. A lesson metadata record is not content delivery.
2. Learner-facing assessment questions and answer submission UI; existing API grading is server-side only.
3. Instructor attendance, calendar and gradebook, staff finance integration, customer-admin membership workspaces, and native Microsoft Teams/SharePoint document browsing.
4. External Microsoft tenant organisation membership provisioning. External SSO remains supported at the portal sign-in layer, but LMS access returns 403 until separately approved.
5. Production Cosmos DB endpoint/roles and real learner workflow validation. CI can verify code but not infer these live credentials and permissions.

## Acceptance checklist

- GitHub CI, dependency audit, unit tests, frontend and Azure Functions TypeScript builds, Lighthouse quality gate pass.
- A real home-tenant Student signs in, sees a published course, enrols, and sees the same enrolment after logout/login.
- An authorised instructor creates a draft and cannot publish it; staff can publish after review.
- Student A cannot read Student B's enrolment/progress; wrong-organisation requests fail.
- A non-enrolled student cannot access lesson metadata, and lesson APIs do not disclose Blob object keys.
- A personal/external Microsoft account signs in but receives an accurate unprovisioned-LMS notice (never another organisation's records).
- No sample records or fabricated progress.

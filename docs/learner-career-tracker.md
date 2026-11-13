# Learner career tracker — staged implementation (2026-11-06)

## Purpose
The existing Student **Career & jobs** workspace now provides an authenticated, private
application-tracking list, separate from the existing **instructor recruitment applications**.
No CV files are uploaded, and nothing is submitted to external employers by this feature.

## Architecture
- Frontend: `src/CareerResources.tsx` and `src/career-api.ts`; reuses the portal's
  MSAL account, PKCE flow, and delegated `access_as_user` API scope.
- Server: `api/careerApplicationFunctions.ts`, mounted by `api/entrypoint.ts`.
- Storage: existing Cosmos DB NoSQL container via `CosmosLmsStore`, collection
  `career-applications-v1`.
- Owner identity: derived exclusively from verified access-token claims (including
  tenant namespacing for external accounts), never accepted from a request body.
- Records: position title, employer, optional HTTPS vacancy URL, self-reported status,
  timestamps and random UUID; up to 100 records per learner.
- Concurrency: Cosmos ETags protect status updates from overwriting concurrent edits.

## Routes
All calls require `Authorization: Bearer <valid API access token>`:
- `GET /api/me/career/applications` — list only the signed-in learner's records
- `POST /api/me/career/applications` — add an opportunity
- `PATCH /api/me/career/applications/{id}` — change a self-reported status
- `DELETE /api/me/career/applications/{id}` — remove a record

All write APIs enforce input limits, HTTPS-only URLs and server-scoped identity.

## Runtime prerequisites
Azure Functions must have `ENTRA_TENANT_ID`, `API_CLIENT_ID`,
`LMS_HOME_ORGANIZATION_ID`, `LMS_COSMOS_ENDPOINT`, `LMS_COSMOS_DATABASE`,
and `LMS_COSMOS_CONTAINER`. The Functions managed identity must have the appropriate
Cosmos data-plane permissions, with private network access where configured.
The existing Allowed Origins policy must include the portal's production origin.
Missing storage settings return 503 rather than pretending an application was saved.

## Acceptance gates
1. `npm ci && npm test && npm run build && npm run build:api`.
2. Sign in as two distinct learner identities; each sees only their own records.
3. Create, change status, reload, and delete; verify data persists across devices.
4. Submit invalid HTTP, credential-bearing, and javascript URLs; expect HTTP 400.
5. Verify missing/expired access tokens return 401 and cross-account guessed UUIDs
   cannot access or mutate another user's record.
6. Simulate concurrent status edits; expect one conditional-write conflict (409).
7. Check the student view in keyboard, mobile, light/dark and screen-reader modes.
8. Confirm no external applications, messages or CV uploads happen.

## Future scope
The Jobs site publishes a **separately reviewed** vacancy feed and links back to the
authenticated learner workspace. Automated importers, employer integrations, learner
skills matching, application verification and analytics are out of scope for this initial
slice and must have their own privacy, consent, rate-limit and data-provenance reviews.

# Skunkie learner assessment + Individual Development Roadmap (IDR)

**Architectural distinction:** Skunkie learner assessment profiles learning preferences, engagement, self-reported confidence, interests and optional support needs. It does **not** diagnose fixed learning styles, measure IQ or infer aptitude from a short questionnaire. A separate career/competency assessment drives the IDR. Evidence-based tasks can extend the learner profile later.

## Implemented on feature branch

- `src/learner-assessment/model.ts` — versioned learner-assessment and learner-profile schemas, separate from `src/idr/model.ts`.
- `api/skunkieAssessmentFunctions.ts` — Microsoft Entra-verified routes and per-student Cosmos DB storage, with home-tenant restriction, server-derived ownership and consent.
- `src/api.ts` — authenticated API client.
- `src/learner-assessment/workspace.tsx` — learner questionnaire and private IDR reader.
- `src/student-experience.tsx` — independent navigation items: My learner assessment and My development roadmap.
- `src/idr/generate.ts` + unit tests — separate, unconnected draft career-plan engine for an approved competency template.

### Authenticated endpoints (available once the Azure Functions build is deployed/configured)

| Endpoint | Function |
| --- | --- |
| `GET /api/me/skunkie/assessment` | Read only the signed-in learner's assessment |
| `PUT /api/me/skunkie/assessment` | Validate, consent-check and persist questionnaire responses |
| `DELETE /api/me/skunkie/assessment` | Remove learner-assessment profile |
| `GET /api/me/idr/roadmap` | Read only the signed-in learner's private roadmap |
| `PUT /api/me/idr/roadmap` | Create an **empty draft shell only**, never overwrite an existing roadmap |

**Important:** These endpoints do not yet perform aptitude tests, generate AI career plans, import Microsoft Forms, approve roadmap content, or delete all potential downstream derivatives. An IDR is not automatically created by completing the learner questionnaire.

## Backend prerequisites

The API expects the existing `ENTRA_TENANT_ID`, `LMS_HOME_ORGANIZATION_ID`, `LMS_COSMOS_ENDPOINT`, `LMS_COSMOS_DATABASE`, and `LMS_COSMOS_CONTAINER` settings plus Cosmos RBAC permissions for the Function App's managed identity. No new frontend secret. The home-tenant restriction matches the current learner-preferences pilot, so external MSA learners require a separate deliberate provisioning policy before full access.

## Acceptance criteria before production

1. Authenticated learner A can save, reload, and delete her own assessment across devices; learner B cannot see A's record.
2. Expired, invalid, wrong-audience or forged access tokens return an authorization error.
3. No unauthenticated access, no public GitHub commit of user assessment data.
4. Input validation, malformed JSON, invalid consent, missing Cosmos settings and provider failures produce safe, predictable responses.
5. IDR is never silently invented from learning preferences and an existing IDR is never replaced by an unreviewed draft.
6. Student navigation and screen-reader support work in mobile, desktop, dark and light modes.
7. End-to-end tests run against **synthetic** learners and a non-production Azure environment.

## Next build stages

- Review exact Microsoft Forms questions and the assessment workbook's mappings before migrating form data.
- Add structured learning activity evidence (practice performance, assistance requirements, reflection), with explicit user permission and calibrated interpretation.
- Add vetted career-role skill matrices and assessment instruments to drive the IDR.
- Add the private IDR timeline, evidence submission, staff review/approval, and version history with optimistic concurrency.
- Integrate Skunkie conversations with the saved learner profile through secured backend authorization, not public static data.
- Run `npm test`, `npm run build`, `npm run build:api`, and authenticated staging end-to-end tests before merge/deploy.

# Skunkie Individual Development Roadmap — implementation foundation

Status: **foundation only; NOT deployed or connected to production**.

## Existing system

- Student portal: `src/student-experience.tsx`, React/MSAL.
- Authentication: Entra ID; the API must derive `learnerSubject` from the verified bearer-token claims.
- API client: `src/api.ts`, Azure Functions under `/api`.
- Existing learner-preferences pilot is **not** the formal IDR assessment.
- References: `skunkworks-academy/ls1607` (30/60/90/365 milestones, projects, mentoring) and `skunkworks-academy/aacca` (curriculum, badges, PDF, calendar).

## Proposed learner workflow

1. Student authenticates and expressly opts in to assessment storage.
2. Skunkie presents a versioned assessment questionnaire, including approved fields from the existing Microsoft Form.
3. Backend validates answers and binds submission to the verified student identity; do not accept a client-supplied owner.
4. `generateDraftRoadmap` computes evidence-based competency gaps against an approved role template. Unknown competency level is treated as *unassessed* for presentation; default zero is used only for prioritisation.
5. Optional AI adds narrative and maps **real, published** courses, labs and certifications; label recommendations as proposed until validated.
6. Staff or student review and approve the draft; publish a private authenticated IDR dashboard.
7. Persist milestones, evidence references, updates and audit history server-side. Export PDF/iCalendar on demand.

## Proposed API contract (not implemented)

- `GET /api/me/idr/assessment-template`
- `POST /api/me/idr/assessments` (consent + validated responses)
- `GET /api/me/idr/roadmap`
- `POST /api/me/idr/roadmap/generate`
- `PATCH /api/me/idr/milestones/{id}`
- `POST /api/me/idr/roadmap/approve`
- `DELETE /api/me/idr/data` (subject to legitimate retention obligations)

Each handler must verify the access token and enforce per-student ownership; staff access requires an explicit role. Enforce payload size limits, input validation, request rate limits and audit logging without storing raw responses in logs.

## Microsoft Forms transition

The supplied Forms response URL is a **respondent-facing** link, not permission to retrieve its question schema or responses. Obtain an authorised form export/question definition, then map stable question identifiers to the versioned assessment schema. A historical Excel import must require an explicit identity match and avoid automatic linking by display name. The supplied workbook currently has a single header `ID` and no student responses.

## Security and privacy

- Do not commit any real student records or sensitive assessment exports to GitHub or static GitHub Pages.
- Store learner assessments in a restricted data store with scoped identities, encryption at rest, retention limits and deletion workflows.
- Do not put student PII into AI prompts except the minimum necessary; log redacted operational metadata only.
- Apply POPIA privacy notices and consent as appropriate. Consent is not a substitute for evaluating the applicable lawful processing basis.
- Existing browser-local progress trackers in example sites cannot be treated as cross-device records.

## Build sequence

1. **Completed in this branch:** versioned TypeScript IDR model, baseline draft generator, unit tests.
2. Next: confirm Forms questions + role competency catalogue; implement authenticated Azure Functions persistence.
3. Then: add student navigation, Skunkie questionnaire and private roadmap UI.
4. Finally: end-to-end acceptance tests with synthetic student identities before production deployment.

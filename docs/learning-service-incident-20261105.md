# Learning-service incident — 5 November 2026

The investigation found a Cosmos query defect, an independent missing Skunkie provider configuration, and access-denied responses on the user's LMS and private IDR reads. These are separate findings. The exact cause of the observed HTTP 403 remains unconfirmed without its response body or correlated request evidence. Neither a successful API deployment nor `/api/health` returning `ok: true` proves that database queries, account access or model generation work.

## Access-denied responses and private IDR

The user browser recorded HTTP 403 for `/api/lms/courses`, `/api/lms/me/enrolments` and `/api/me/idr/roadmap`. The UI previously discarded HTTP status and the IDR view described every rejection as a service outage. The client now retains status even when the response is only `Forbidden`; LMS, IDR, learner assessment and Skunkie distinguish access denial (403), expired/invalid sessions (401), and unavailable services (503). Generic access denial does not claim an unverified membership failure or promise signing in again will grant access.

IDR uses a point read from the same Cosmos container, scoped to `student-idr-v1:<organization>:<verified subject>`. It does not execute the catalogue query below. The endpoint verifies the API token and home-tenant membership before storage access, and does not require a staff role. Its GET performs no save or draft creation. Tests cover the authenticated learner key, an actual empty record, rejection before storage for external membership or missing scope, and distinct missing-storage 503.

[Read-only access audit 42107112525](https://github.com/skunkworks-academy/portal/actions/runs/42107112525) verified that the live Function's tenant, API application and delegated scope settings match canonical configuration. App Service built-in authentication is disabled and the IP restrictions contain the default allow rule. These checks do not establish that the user's token has the required tenant/scope. No access policy, role, tenant boundary or credential was changed.

## LMS catalogue query repair

`CosmosLmsStore.list()` sent `SELECT c.value ...`. Cosmos treats `VALUE` as a reserved keyword, so the property must use bracket notation. The adapter maps a rejected query to HTTP 503 with `LMS database unavailable.`, which the workspace displayed as the database-unavailable message. This defect cannot explain HTTP 403, which occurs before that query path, and the provider's live response was not captured.

The corrected query uses `SELECT VALUE c["value"]` and receives each original record directly. The response mapping is updated accordingly, including continuation pages. Organization partition headers, parameterized collection/prefix filters, authentication, role checks, document IDs and stored data are unchanged. An invalid provider response is an error; it is never reported as an empty catalogue.

Primary references:

- [Microsoft's Cosmos query JSON documentation](https://learn.microsoft.com/en-us/cosmos-db/query/get-started-json#bracket-notation) requires bracket notation for properties matching reserved words.
- [Microsoft's Cosmos SQL grammar](https://github.com/Azure/azure-cosmos-dotnet-v3/blob/main/Microsoft.Azure.Cosmos/src/Query/Core/Parser/sql.g4) defines `K_VALUE` separately from the identifiers accepted after a dot.
- [SELECT VALUE projection](https://learn.microsoft.com/en-us/cosmos-db/query/select) describes returning the selected value directly.

The syntax defect is confirmed from the official grammar and source. Production recovery still requires deployment followed by a read-only request from an authorized Microsoft account; no authenticated production data read or write was performed in this investigation.

## Verified live configuration

At investigation time:

- Public `/api/health` returned HTTP 200, `lmsSettings.configured: true`, and `skunkieSettings.configured: false`.
- Anonymous `/api/lms/courses` and `/api/skunkie/status` returned HTTP 401. Authentication was not bypassed to make the warnings disappear.
- [Read-only Azure audit 42105141112](https://github.com/skunkworks-academy/portal/actions/runs/42105141112) found the existing Cosmos account in South Africa North, the `academy` database, all four LMS settings, and the Function's managed identity assigned Cosmos Data Contributor at the `academy/lms` container scope.
- The [4 November API deployment](https://github.com/skunkworks-academy/portal/actions/runs/41830031763) succeeded, but its LMS checks covered configuration presence and anonymous rejection only. Its log explicitly warned that Skunkie was not configured.
- [Expanded audit 42105959834](https://github.com/skunkworks-academy/portal/actions/runs/42105959834) confirmed the `lms` container and `/organizationId` partition key. Both aggregate Application Insights queries returned no rows for the preceding 72 hours; absence of telemetry is not evidence of successful requests.

The expanded existing `learning-readiness-audit.yml` remains read-only. It inspects container partition metadata and queries aggregate HTTP result codes for Cosmos dependencies and LMS/Skunkie requests. It does not print request bodies, prompts, account identifiers, URLs, tokens, keys, exception details or learning records. It never provisions services or changes settings/RBAC.

## Separate Skunkie prerequisite

There are no `AZURE_OPENAI_*` settings in the running Function's inspected configuration. The current backend requires an actual HTTPS Azure OpenAI endpoint, an existing chat-model deployment name, and a server-only API credential. Without those, the authenticated status handler correctly reports unavailable and chat returns a configuration error.

Production activation requires the owner-approved model, processing region/deployment type and budget, then the existing environment values `PORTAL_AZURE_OPENAI_ENDPOINT`, `PORTAL_AZURE_OPENAI_DEPLOYMENT` and secret `PORTAL_AZURE_OPENAI_API_KEY`. No model region was selected, resource provisioned, key requested in chat or provider configuration changed by this repair. See [the existing activation runbook](skunkie-ai-activation-20261103.md); its quota figures are historical and require a fresh check before provisioning.

## Acceptance after release

1. Run the existing tests and both builds, including projection/pagination/empty-response, status-preservation and private-read regression coverage.
2. Deploy through the normal reviewed API workflow.
3. From the user's authenticated account, capture the response text and status for the existing read requests. Resolve the demonstrated scope/membership or upstream denial through the correct authorized configuration; do not infer access from the selected workspace label.
4. From an authorized Staff account, load the real catalogue with `GET /api/lms/courses`; from the learner account, read `/api/me/idr/roadmap`. A genuinely empty record is valid; do not seed records for a visual test. Confirm unauthorized requests remain rejected. Do not change profile/course records as a test.
5. After separately approved Skunkie provisioning, verify authenticated status and an actual authorized response. Do not treat configured settings as successful generation.

The existing LMS and Skunkie UI error paths retain user inputs on failed requests. This repair does not replace records, reset databases, hide errors, grant privileges or fabricate successful saves.

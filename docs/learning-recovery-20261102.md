# Portal learning service recovery — 2 November 2026

Production audit run 41399931282 found no Cosmos DB accounts visible in the configured subscription and no `LMS_*` or `AZURE_OPENAI_*` Function settings. The public API was running, but that did not establish learning-service availability.

## Repairs

- The existing API deployment now provisions a serverless Cosmos NoSQL account in the API region (production: South Africa North), database `academy`, container `lms`, partitioned by `/organizationId`. Backups use local redundancy. There is no pre-provisioned throughput, but Azure usage/storage charges apply.
- Local/key authentication is disabled. The Function's system-assigned managed identity receives Cosmos Data Contributor on this container only. No learner data is seeded, replaced or fabricated.
- The four LMS settings are owned by Bicep so subsequent deployments retain the connection. The home organization is `skunkworks-academy`.
- REST requests use the encoded Cosmos AAD authorization format and query content type. Lists follow continuation tokens; missing containers cannot be mistaken for a successful empty query or write.
- All LMS routes authenticate and check organization membership before constructing the storage service. External/personal Microsoft accounts remain default-deny until a verified organization-membership flow exists.
- Consumed OAuth response fields are removed from the address bar after MSAL finishes, including recoverable errors. Raw authentication errors are not logged. Real authorization codes must never be copied into diagnostics or tests.
- Skunkie has opaque panel surfaces so page content cannot bleed through the conversation.

## Release verification

1. Unit tests, frontend/API builds, Bicep compilation, CI and Lighthouse must pass.
2. Production deployment must complete; `/api/health` must expose `lmsSettings.configured: true`. This is configuration presence, **not a database connectivity claim**.
3. Anonymous `/api/lms/courses` and `/api/lms/me/enrolments` must return 401/403.
4. A fresh sign-in by an authorized home-tenant learner must load the real catalogue and their own enrolments. An empty new database is legitimately empty. Publishing/importing courses is a separate operation.
5. A personal account without organization membership must receive a membership explanation, not a database outage notice. Do not bypass tenant checks to make a screenshot disappear.

## Separate Skunkie blocker

Audit run 41342450864 found zero quota for the checked interactive models in South Africa North, and available regional Standard gpt-4o-mini quota/capacity in Sweden Central. No processing-region change or AI deployment is part of this repair. Activate Skunkie only after a processing region is selected and the production model settings are supplied; then verify a real authenticated answer. The existing GitHub production variables and secret are documented in `skunkie-mobile-incident-20261030.md`.

Microsoft specifications: https://learn.microsoft.com/rest/api/cosmos-db/access-control-on-cosmosdb-resources and https://learn.microsoft.com/rest/api/cosmos-db/querying-cosmosdb-resources-using-the-rest-api.

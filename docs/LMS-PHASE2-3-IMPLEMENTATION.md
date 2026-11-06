# LMS Phase 2–3 engineering status

This branch adds a domain service with tenant-keyed course, media metadata, enrolment, assessment scoring and progress operations, plus unit tests. It is **not a production LMS**.

## Required next work
1. Implement a durable Cosmos DB or SQL-backed LmsStore with atomic conditional writes, versioning and organization partitions. The memory store in unit tests is not for deployment.
2. Construct LmsContext only on the server after Entra JWT validation and trusted organization membership lookup. Never accept client-provided role or organization IDs. Staff roles must be checked against the home tenant.
3. Add protected Azure Functions endpoints for course creation, review, publication, lessons, assessments, enrolment and progress.
4. Add private Azure Blob Storage uploads with server-authorized, short-lived SAS URLs, size/type verification and malware scanning. The current lesson blobKey is metadata, not an upload.
5. Add React student, instructor, staff and customer-admin workspaces with authenticated API calls, proper error states and no sample data.
6. Require entitlement/payment verification before enabling paid course access. Add rate limits and assessment answer-key redaction.
7. Add concurrency and integration tests, browser journeys and audit logging.

## Validation
Run `npm ci && npm test && npm run build && npm run build:api` and inspect CI before merging.

**Do not deploy as production-ready until the items above are implemented and verified.**

# Microsoft Entra SCIM 2.0 provisioning and App Gallery launch gates

**Status:** Feature-branch implementation; disabled by default. Not an Entra configuration change, production deployment, Microsoft certification, or gallery publication.

## Identity contract and deployment boundary

- Academy application/client ID: e22672ae-61a6-434e-b135-3360557819ec
- Home tenant ID: 338a8916-80d9-467c-a94a-7f61d04ef7d5
- Enterprise service-principal object ID supplied in Entra blade: 5546429d-1373-49ab-b587-67deba7e84c0
- Entra blade: https://entra.microsoft.com/#view/Microsoft_AAD_Connect_Provisioning/ProvisioningMenuBlade/~/Overview/objectId/5546429d-1373-49ab-b587-67deba7e84c0/appId/e22672ae-61a6-434e-b135-3360557819ec
- Portal sign-in uses MSAL/OIDC and delegated access_as_user; SCIM is independent OAuth 2.0 machine-to-machine.
- SCIM changes cannot assign Portal.Admin/Staff/Instructor app roles, licenses, Marketplace entitlements, course enrolments or customer administration rights.
- New records are partitioned by **server-verified organizationId** in the existing Azure Cosmos LMS database; callers cannot choose an org by URL or SCIM request body.
- This release includes an optional SCIM-active-user check in LMS and Skunkie routes. It does not yet enforce provisioning against every SharePoint-based Portal route, consumer sign-in route, or external customer tenant. Do not declare global deprovisioning complete.

## Endpoints (after deploying the API and enabling SCIM)

SCIM base URL: https://api.skunkworksacademy.com/api/scim/v2

Token URL: https://api.skunkworksacademy.com/api/scim/token

Resources:

| Method | Route | Behavior |
|---|---|---|
| POST | /Users, /Groups | Create user or group; 201 and Location |
| GET | /Users, /Groups | Filter, pagination, empty 200 ListResponse |
| GET | /Users/{id}, /Groups/{id} | Get one resource, 404 if unknown |
| PUT | /Users/{id}, /Groups/{id} | Full replace |
| PATCH | /Users/{id}, /Groups/{id} | Partial user updates, batch group membership changes |
| DELETE | /Users/{id} | Soft-deactivate user (active=false), 204 |
| DELETE | /Groups/{id} | Delete SCIM group, 204 |
| GET | /Schemas, /ServiceProviderConfig, /ResourceTypes | SCIM discovery |

Supported user fields: userName, externalId (immutable after create), name.givenName, name.familyName, name.formatted, displayName, emails, active. Supported group fields: displayName, immutable externalId, members. User filters: userName, externalId, id, emails[type eq "work"].value. Group filters: displayName, externalId, id. Only SCIM eq filters are supported. PATCH operation names are case insensitive.

Group membership is *not* a source of privileged Academy role assignment. Use the existing home-tenant app role process for instructor/staff rights, subject to human approval.

## Server configuration (Azure Function App)

Set the following **server-side** app settings using **Key Vault references** for sensitive values, never VITE_, source control, Actions logs, or public browser configuration.

| Name | Required | Value / purpose |
|---|---|---|
| SCIM_ENABLED | yes | false initially; set true only for isolated pilot |
| SCIM_PUBLIC_BASE_URL | yes | https://api.skunkworksacademy.com/api/scim/v2 |
| SCIM_TOKEN_SIGNING_KEY | yes | 32+ cryptographically random bytes encoded base64url, Key Vault reference |
| SCIM_CLIENTS_JSON | yes | Key Vault reference to controlled registry of OAuth clients |
| LMS_COSMOS_ENDPOINT | yes | Existing HTTPS Cosmos endpoint |
| LMS_COSMOS_DATABASE | yes | Existing LMS database |
| LMS_COSMOS_CONTAINER | yes | Existing LMS container with organizationId partition |
| SCIM_ENFORCE_PROVISIONED_USERS | optional | false initially; true only after home-tenant pilot users are backfilled |

Client registry schema (illustration; values below are **not** real credentials):

~~~json
[
  {
    "clientId": "customer-tenant-scim",
    "organizationId": "approved-academy-org",
    "entraTenantId": "00000000-0000-0000-0000-000000000000",
    "enabled": true,
    "secretHashes": [
      {
        "salt": "<32 hexadecimal chars from 16 random bytes>",
        "hash": "<128 hexadecimal chars from scrypt(secret, salt, 64)>",
        "expiresAt": "2028-10-01T00:00:00Z"
      }
    ]
  }
]
~~~

Use *one distinct client/secret for each approved organization and Entra tenant*. Generate a 32-byte random client secret off-line, hash using Node.js scrypt with an independent random 16-byte salt and 64-byte output; keep only the salt and hash in the Key Vault registry. Deliver the client secret once through a secure customer administrator channel. Set an operational expiry between one and three years, and rotate well before expiry by temporarily storing two hashes for the same client. Rotate the JWT signing key with a governed cutover and account for its 300-second access-token lifetime. Audit client activation, consent, tenant mapping and secret rotation.

No client is enabled by default. If SCIM_ENABLED is false or registry/key/storage is missing, requests fail closed. The token endpoint accepts application/x-www-form-urlencoded client_credentials with client_id, client_secret and optional scope=scim.provision; it issues a 300-second scoped bearer token. SCIM endpoints reject absent, malformed, expired or tenant-mismatched access tokens. No long-lived SCIM bearer token, Basic authentication or OAuth authorization-code grant is used.

### Tenant onboarding

1. Confirm an authorized organization administrator, Entra tenant GUID, Academy organization ID, commercial entitlement and legal data-processing region. Never infer tenant authorization from Microsoft CSP reseller status or a generic app login.
2. Establish an organization-isolated Cosmos partition and baseline access policies. Create a unique SCIM client credential in the secret manager and record its tenant/organization binding with expiry.
3. Deploy the API branch to isolated staging first. Confirm the public HTTPS endpoint and OAuth token endpoint are reachable, Azure managed identity can read/write the Cosmos organization partition, and no tokens or personal data enter application logs.
4. In Microsoft Entra admin center, create a **non-gallery** enterprise application for the pilot; configure provisioning with the SCIM tenant URL and the OAuth 2.0 client-credentials details. Assign only a dedicated test group with test user identities.
5. Set target attribute mappings: userPrincipalName -> userName; objectId -> externalId (**mandatory for LMS active-user enforcement**); givenName -> name.givenName; surname -> name.familyName; mail -> emails[type eq "work"].value; isSoftDeleted -> active; group objectId -> externalId; group displayName -> displayName; group members -> members.
6. Run **Test Connection**, **Provision on demand**, and an initial provisioning cycle. Validate create/update/deactivate/reactivate and group membership add/remove. Verify an unmatched GET filter returns 200 with zero results and tenant A cannot query tenant B.
7. Start with SCIM_ENFORCE_PROVISIONED_USERS=false. Backfill and compare the home-tenant LMS identity mapping. Only set the flag true when the impact is accepted; then verify that deactivated users lose authenticated LMS and Skunkie data access. Existing sign-in and SharePoint-based routes still need a full access-control integration.
8. Track required tests and deployment evidence (timestamp, tenant alias, endpoint version, response status and correlation ID without any PII or tokens). Define rollback as disabling the provisioning job, disabling affected OAuth clients and reverting the enforcement flag, subject to incident policy.

## Microsoft App Gallery submission is a separate gate

Requirements from Microsoft (verify again before submission):

- Production-ready publicly accessible SaaS; engineering and support contacts; public setup/troubleshooting documentation; Microsoft AI Cloud Partner Program membership and **Partner One ID**.
- Validate SSO separately from SCIM where both are listed. Verify publisher tenant registration, consent, OIDC redirect URIs, logout, verified publisher, roles and policy as applicable.
- SCIM 2.0 users and groups; SCIM discovery; filtered empty responses; user deprovisioning; tested OAuth 2.0 credentials; successful non-gallery pilot; >=25 requests per second per tenant in sustained load test with an auditable error-rate and latency report.
- Microsoft currently describes a **100 mutual-customer non-gallery deployment** requirement for SCIM publisher onboarding. Confirm qualifying evidence with Microsoft before submitting; do not claim eligibility without it.
- Required production improvements before broad rollout: transactional/indexed uniqueness and queries for high-scale tenants, version-aware concurrent PATCH handling, per-tenant quotas and rate controls, resilient storage retry telemetry, full access revocation across Portal APIs, user reassignment and group reconciliation, multi-tenant LMS tenant resolver, security/penetration review, WIF consideration, load and failure tests.
- Submit validation results using the current Microsoft Entra gallery onboarding process. Gallery listing and Microsoft commercial marketplace SaaS transactable listing are **different approval processes**; neither is created by merging this PR.

**Publication state:** Not submitted. No Microsoft gallery listing, customer provisioning, admin consent, app-role change or live Azure setting is implied by this repository change.

## Test plan and security cases

Run: npm ci && npm test && npm run build && npm run build:api

- OAuth: disabled configuration, wrong credentials, expired secrets, rotated secrets, missing JWT, tampered JWT, issuer/audience/tenant mismatch.
- User: create, duplicate, GET by ID, filter by userName/externalId/work email, pagination, PUT, multi-op PATCH, active=false, re-enable, idempotent DELETE.
- Group: create, GET by displayName, multi-member add/remove, removed member, foreign-tenant member rejection, delete.
- Access: home-tenant LMS/Skunkie allow only active provisioned oid when the enforcement flag is enabled, and continue current behavior with the flag disabled.
- Cross-tenant: same email, same externalId and same SCIM resource path in distinct customer organizations never reveal or modify each other's data.
- Integration/load: SCIM 2.0 Microsoft non-gallery validation, 25 req/s per tenant, persistent Cosmos data durability after redeployment, optimistic concurrency and group membership scale.

## References

- Microsoft SCIM tutorial: https://learn.microsoft.com/en-gb/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups
- App gallery prerequisites: https://learn.microsoft.com/en-gb/entra/identity/enterprise-apps/v2-howto-app-gallery-listing
- SCIM gallery provisioning requirements: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/app-gallery-user-provisioning-requirements
- RFC 7643 SCIM resource schema: https://www.rfc-editor.org/rfc/rfc7643
- RFC 7644 SCIM protocol: https://www.rfc-editor.org/rfc/rfc7644

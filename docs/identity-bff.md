# Identity BFF Foundation

Status: implementation foundation, default disabled  
Phase: Step 3 of the platform identity migration  
Production cutover: **not included in this change**

## Purpose

The Identity BFF introduces a server-managed Microsoft Entra sign-in/session boundary without changing the portal's current MSAL browser flow. It is intentionally isolated behind `IDENTITY_BFF_ENABLED=false` until the same-origin routing, confidential Entra application, Azure Storage permissions and secrets are provisioned and validated in staging.

This phase does **not** remove `localStorage` from `src/authConfig.ts`; that is the subsequent portal migration phase.

## Public contract

When enabled behind the portal origin, the intended public routes are:

- `GET https://portal.skunkworksacademy.com/auth/login`
- `GET https://portal.skunkworksacademy.com/auth/callback`
- `GET https://portal.skunkworksacademy.com/session`
- `POST https://portal.skunkworksacademy.com/auth/logout`

Azure Functions currently applies its `/api` route prefix. The function backend therefore exposes `/api/auth/login`, `/api/auth/callback`, `/api/session` and `/api/auth/logout` internally. Production enablement requires an edge/reverse-proxy rule that presents the routes above on `portal.skunkworksacademy.com` while preserving the original host/protocol in trusted forwarding headers.

Do not enable this BFF only on `api.skunkworksacademy.com`: a host-only session cookie set there is not a portal session and does not satisfy the architecture contract.

## Security properties implemented

- Authorization Code Flow with PKCE `S256` only.
- 256-bit random OIDC `state` and nonce.
- Server-side PKCE verifier; only the challenge is sent to the browser/IdP.
- Five-minute authorization transaction TTL by default; hard maximum ten minutes.
- Authorization transactions are keyed by a SHA-256 hash of `state`.
- Azure Table ETag conditional deletion atomically consumes transaction state before code exchange.
- Exact transaction binding to property, public origin and redirect URI.
- Canonical workforce tenant only for the first BFF rollout.
- Immutable internal Academy `subject_id`; Entra `{iss, tid, oid}` is stored as upstream linkage only.
- No subject mapping by email, UPN or display name.
- Opaque 256-bit application session identifiers; only their SHA-256 hashes are stored.
- Host-only `__Host-swa_session` cookie with `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax` and no `Domain` attribute.
- Token bundles remain server-side and are protected using AES-256-GCM before persistence.
- `GET /session` is non-cacheable and does not return Entra tokens, session identifiers or raw provider claims.
- Cookie-authenticated logout requires a CSRF synchronizer token and exact same-origin `Origin` validation.
- Login return targets are reduced to a local path; external return URLs fall back to `/`.
- No BFF route depends on credentialed CORS or a broad cross-subdomain cookie.

## Server-side storage

The implementation uses Azure Table Storage through `DefaultAzureCredential` and the Azure Table REST API. No storage access key is committed or required by the application.

The function identity must be granted the minimum required Azure RBAC permission on the selected Storage Account, normally **Storage Table Data Contributor**. Scope that assignment to the dedicated storage account used by the BFF rather than the subscription when possible.

Three tables are created lazily after the BFF is enabled:

- `<prefix>AuthTxn` — short-lived OIDC transactions.
- `<prefix>Sessions` — opaque application sessions and encrypted token bundles.
- `<prefix>IdentityLinks` — verified Entra identity linkage to immutable Academy `subject_id` values.

The default prefix is `SwaIdentity`.

Storage expiry is enforced on read/consume even though Azure Tables does not provide automatic TTL cleanup. A later operations PR should add scheduled deletion of expired session/transaction rows; stale rows must never become valid merely because cleanup is delayed.

## Required environment configuration

```text
IDENTITY_BFF_ENABLED=false
IDENTITY_BFF_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
IDENTITY_BFF_CLIENT_ID=<confidential-web-app-client-id>
IDENTITY_BFF_CLIENT_SECRET=<secret-reference-value>
IDENTITY_BFF_PUBLIC_ORIGIN=https://portal.skunkworksacademy.com
IDENTITY_BFF_REDIRECT_URI=https://portal.skunkworksacademy.com/auth/callback
IDENTITY_BFF_PROPERTY_ID=portal
IDENTITY_BFF_STORAGE_ACCOUNT=<dedicated-storage-account-name>
IDENTITY_BFF_TABLE_PREFIX=SwaIdentity
IDENTITY_BFF_MANAGED_IDENTITY_CLIENT_ID=<optional-user-assigned-managed-identity-client-id>
IDENTITY_BFF_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
IDENTITY_BFF_API_SCOPE=<optional-delegated-api-scope>
IDENTITY_BFF_TRANSACTION_TTL_MINUTES=5
IDENTITY_BFF_SESSION_TTL_MINUTES=480
```

`IDENTITY_BFF_CLIENT_SECRET` and `IDENTITY_BFF_ENCRYPTION_KEY` are secrets. Store them in the governed Azure/GitHub environment secret boundary; never commit real values to the repository or expose them through `VITE_*` variables.

`IDENTITY_BFF_ENCRYPTION_KEY` must be the Base64 encoding of exactly 32 random bytes. Rotation requires a key-version/migration design before production traffic because existing encrypted token bundles would otherwise become unreadable.

## Entra application requirement

Do not reuse a browser-only SPA credential model as the BFF confidential client by assumption.

Provision or explicitly approve an Entra application capable of server-side confidential-client code exchange with the exact web redirect URI:

```text
https://portal.skunkworksacademy.com/auth/callback
```

The first rollout is single-tenant. Guest, multi-tenant and personal Microsoft accounts remain denied until the Academy subject-linking policy is extended and reviewed.

If `IDENTITY_BFF_API_SCOPE` is configured, verify delegated consent and audience behavior in staging before production. The existing portal API scope should not be added blindly where its service principal/delegated grant is not provisioned.

## Routing gate

Before setting `IDENTITY_BFF_ENABLED=true`, prove all of the following:

1. `portal.skunkworksacademy.com/auth/*` and `/session` reach the Identity BFF backend on the same public origin.
2. Direct access through `api.skunkworksacademy.com` is not treated as the browser session authority.
3. The reverse proxy preserves the original host and HTTPS protocol in trusted forwarding headers.
4. The callback URI exactly matches the Entra web redirect registration.
5. No CDN/proxy caches `/auth/*` or `/session` responses.
6. `Set-Cookie` is not stripped or rewritten to a parent-domain cookie.

## Staging verification

Required before any portal cutover:

- BFF disabled returns no usable identity route.
- Sign-in authorization request contains `code_challenge_method=S256`.
- Replayed, expired or unknown `state` fails before a second code exchange.
- Wrong tenant is rejected.
- Missing `oid` is rejected in the initial single-tenant policy.
- External `returnTo` is rejected/falls back locally.
- Successful callback issues `__Host-swa_session` without a `Domain` attribute.
- Browser storage receives no access token or refresh token from the BFF.
- `/session` returns only the minimal session view with `Cache-Control: no-store, private`.
- Wrong/missing CSRF token rejects logout.
- Cross-origin logout rejects even with a valid cookie.
- Revoked/deleted or expired session becomes anonymous.
- Multiple function instances resolve the same session through Azure Tables.
- Azure Storage RBAC is least privilege and no account key is required.

## Rollback

This phase is designed for immediate rollback:

1. Set `IDENTITY_BFF_ENABLED=false`.
2. Remove/disable the edge routing for `/auth/*` and `/session` if it was staged.
3. Leave the existing MSAL portal flow unchanged.
4. Do not restore service by exposing browser token storage to other Academy subdomains or weakening cookie attributes.

The next phase may migrate the portal frontend from MSAL browser persistence to this BFF only after this implementation, its CI checks, CodeRabbit security review and staging topology are approved.

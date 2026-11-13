# Next release: Academy identity-first user experience

Status: release candidate in GitHub PRs, not yet deployed or declared production-ready.

## Decision and scope

**Priority 0 — learner account registration and sign-in.** Use the current Microsoft identity flow (`/common`, supporting configured personal and work/school accounts) as the only login authority for this iteration. Public users who already have Microsoft accounts choose **Create learner profile** to authenticate and enter protected learner onboarding. Users without one follow Microsoft's official `signup.live.com` account creation and return to the Academy. Skunkworks does **not** collect user passwords. A first-time Microsoft login is not proof of a completed Academy registration; success requires persisted learner-profile confirmation after explicit learner consent. Staff and Instructor privileges must never be inferred from an external tenant or an unauthenticated UI role switch.

**Priority 1 — secure session persistence.** The existing MSAL SPA uses `sessionStorage` and is the current compatibility flow. The durable target is the already-implemented Entra BFF with Azure Table-backed, opaque, host-only `__Host-swa_session` cookies, server-side revocation, callback browser-binding, PKCE S256 and CSRF-validated logout. Do not assert global SSO is active or switch to `bff-session` mode before Azure Front Door/Entra/Key Vault/managed identity deployment and end-to-end verification. Do not introduce localStorage bearer-token sharing or broad `.skunkworksacademy.com` session cookies.

**Priority 2 — return to original public page.** `portal#177` validates and temporarily stores a navigation-only `returnTo` hint with a 30-minute expiry and a post-authentication choice to **Return to page** or **Open my portal**. `www#149` adds the companion public links. Deploy the portal first and the public helper second. Returning to a public page does not itself create a local session there; its own BFF must be deployed for the header to show authenticated state.

## Repository dependencies and release order

| Order | PR | Acceptance condition |
| --- | --- | --- |
| 1 | `skunkworks-academy/portal#177` | Registration CTA and Microsoft sign-in verified, permission-isolated onboarding, return chooser, Vitest/security checks green |
| 2 | `skunkworks-academy/www#149` | Public Sign in links validated against exact hosts, filters and fragments retained, no nested redirects, all checks green |
| 3 | `skunkworks-academy/portal#178` | Azure identity edge in approved staging, Front Door origin restrictions and managed certificates verified |
| 4 | `skunkworks-academy/www#150` | Same-origin session-aware global header, gated on actual deployed BFF and security/visual checks |

All dependent PRs must be reviewed and reconciled before merging; overlapping edits to the shared header or Connections must be resolved by integration testing, never by force-merge.

## Required E2E release checklist

1. First-time personal Microsoft account completes sign-in and consenting learner onboarding, persists learner assessment/profile in the authorised backend, reloads, and retains the same profile without exposing it to another account.
2. Existing authorised work account signs in; verified role-based permissions are enforced in APIs. External account impersonation of `Portal.Staff` or `Portal.Admin` fails closed.
3. Cancelled login, blocked storage, expired hints, invalid tenant, denied consent, failed backend, and sign-out all fail safely without showing another user's account.
4. Public site `/courses/?q=cloud#requirements` leads to Portal login; after login user may return to the exact approved URL or open Portal. Evil URLs, OAuth query/hash tokens, and duplicate `returnTo` are rejected.
5. Front Door `/auth/*` and `/session` work from the exact original origin. Wrong host, forged forwarded headers, missing `X-Azure-FDID`, unbound callback, CSRF attack and direct Azure Functions origin requests fail. Validate TLS and no-cache headers.
6. Mobile 360px/390px, desktop, keyboard, light/dark and screen readers pass; connection catalogue and shared header retain behaviour.
7. GitHub CI, platform/visual regression, CodeQL/security and staging authentication smoke tests are green; deployment rollback to MSAL is documented.

## Out of scope this release

Dataverse profile synchronisation, Microsoft 365 MCP administration, Shopify customer authentication bridge, new staff provisioning and cross-customer delegated Microsoft Graph operations. These require separate access/consent workflows and cannot block the learner sign-in release.

## Deployment gate

No production cutover until real Azure configuration and DNS changes have been authorized, dedicated Function origins and secret references verified, exact redirect URIs registered, and an observed end-to-end first-time sign-in completed.

# Unified Academy Workspace — Microsoft SSO and SharePoint integration

## Delivery

- Homepage: `https://portal.skunkworksacademy.com/` retains a public Microsoft login experience.
- Signed-in Student accounts continue to use the existing student dashboard (no learning-workflow regression).
- Signed-in Instructor and authorised Staff accounts enter the new responsive operations workspace, inspired by the sidebar/dashboard information architecture of DizzyOps but branded Skunkworks Academy.
- The existing instructor application, job, profile, class and administration screens remain accessible via **Open management tools** and **Back to Academy workspace**.
- Microsoft Entra ID is the identity provider; SharePoint is a Microsoft 365 resource, **not** a separate identity provider.
- The front end does not store or publish SharePoint records, access tokens or client credentials in static markup.

## Entra application already referenced by this repository

- Tenant ID: `338a8916-80d9-467c-a94a-7f61d04ef7d5`.
- SPA client ID: `e22672ae-61a6-434e-b135-3360557819ec`.
- Redirect URI: `https://portal.skunkworksacademy.com/`.
- Sign-in authority: `https://login.microsoftonline.com/common` for any Microsoft Entra work/school account or personal Microsoft account. The home tenant GUID remains the only source of staff/instructor role assignment.
- Browser sign-in: MSAL authorization code + PKCE, no browser client secret.
- Entra app roles: `Portal.Student`, `Portal.Instructor`, `Portal.Staff`, `Portal.Admin`.
- The API must validate Microsoft access tokens and enforce permissions server-side. Hiding frontend navigation is not an authorisation boundary.

Verify these settings in the tenant's Entra administrative portal; repository configuration does not prove that tenant consent, role assignments, deployment settings or secrets are active.

## SharePoint discovery and configuration discrepancy (2026-10-26)

The signed-in SharePoint connector was able to resolve:

- **Verified site:** `https://bluemix944.sharepoint.com/sites/Academy`
- **Document library:** `Documents` (under `Shared Documents`)
- No portal-specific operational SharePoint lists were returned by the site listing.

By contrast, `api/config.ts` currently defaults to `SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com` and `SHAREPOINT_SITE_PATH=/sites/InstructorPortal`. An attempted lookup of `https://bluemix944.sharepoint.com/sites/InstructorPortal` did not resolve. **Do not assume that these identities/sites refer to the same tenant.** The connected SharePoint account is not by itself proof of the application's app-only Graph permissions.

The new interface links to the **verified** Academy SharePoint site. It does not change the production API hostname/path or create operational SharePoint lists without reviewing the existing deployment and migration requirements.

## Administrator actions needed for live SharePoint data inside the portal

1. Confirm whether the Academy SharePoint host and the Entra app ID above belong to the same intended tenant, or implement the cross-tenant consent/access model explicitly.
2. Inspect deployed Azure Functions settings for `SHAREPOINT_HOSTNAME`, `SHAREPOINT_SITE_PATH`, `GRAPH_TENANT_ID`, `API_CLIENT_ID`, `API_CLIENT_SECRET` (do not paste secrets into GitHub).
3. Determine the canonical operational list schemas needed by `api/graph.ts` and create/migrate them in a controlled change.
4. For app-only access, grant `Sites.Selected` with an explicit per-site permission grant. Use least privilege and audit Graph requests.
5. Validate Entra SPA redirect URIs, enterprise app assignment policy, login and sign-out; test a Student, Instructor, Staff and unauthorised user.
6. Confirm GitHub Pages custom-domain DNS and `Deploy portal frontend` workflow; run end-to-end sign-in and SharePoint access tests after deployment.
7. If cross-subdomain shared sessions are required, deploy and activate the **same-origin confidential identity BFF** already present in `api/identityBff*.ts`, with HttpOnly Secure SameSite cookies, managed secrets, session revocation and a protected callback. Current MSAL SPA sign-in is **not** equivalent to platform-wide cookie SSO.

## Scope and safeguards

- Financial screens are explicitly unconnected and show no fabricated invoices, customer or revenue records.
- Existing API responses (including any older fallback catalogue fixtures) must not be interpreted as verified live financial or learner activity.
- Static-site integration does not grant automatic SharePoint document access. The Microsoft 365 resource enforces the signed-in user's or service principal's permissions.
- Never use Graph tokens, refresh tokens, tenant secrets or personal SharePoint connector credentials in the Vite frontend.
- Test responsive layout at 320px, 390px, tablet and desktop, keyboard focus, Search Ctrl/⌘K, Escape and role switching by re-authentication.

## Self-service Microsoft sign-in and learner registration (2026-10-26)

The login-only page offers **Sign in with Microsoft** to all Microsoft Entra ID work/school and personal Microsoft accounts (Outlook.com, Hotmail, Live). There is no separate Skunkworks password. A verified first sign-in creates a real **Student** profile in the Academy data store, if the SharePoint-backed API and Graph permissions are ready; no fabricated enrolments, courses, messages or instructor assignments are created. Subsequent sign-ins reuse the same identity. Dashboard and navigation remain inaccessible until Microsoft authentication completes.

**Security invariants**
- Only the registered Portal application `e22672ae-61a6-434e-b135-3360557819ec` is the intended token audience.
- The API validates the exact tenant-specific v2 issuer, a Microsoft signing key for that tenant, the `access_as_user` delegated scope, user identity and tenant-qualified external user IDs. Home-tenant object IDs are preserved for existing SharePoint records.
- Unassigned or external users are **Student**. Only trusted home-tenant `Portal.Instructor`, `Portal.Staff` or `Portal.Admin` assignments can unlock privileged features. Never trust a role with the same name from a foreign tenant.
- For security and compatibility, work/school administrator consent may be mandatory in the user's organisation. Tenant conditional access, disabled accounts and customer policies can still prohibit login.
- Authenticating does not automatically grant Microsoft Graph/SharePoint access to the customer's own tenant or the Academy's operational SharePoint lists.

**Required Entra tenant settings (verify in the live Microsoft Entra portal; GitHub cannot apply them on its own)**
1. **App registrations** → **Skunkworks Academy Portal** → **Authentication** → Supported account types: **Accounts in any organisational directory and personal Microsoft accounts** (`AzureADandPersonalMicrosoftAccount`). SPA redirect: `https://portal.skunkworksacademy.com/`. Implicit grant remains OFF.
2. **Enterprise applications** → **Skunkworks Academy Portal** → **Properties** → **Assignment required? No** for self-service users. Keep `Portal.Staff` and `Portal.Admin` app roles explicitly assigned to approved Academy team members only.
3. **Expose an API**: retain the existing `access_as_user` delegated permission and confirm user/admin consent policy. External organisations may block consent; administrators in those tenants may have to consent before their users can use the API. Do not automatically grant Graph `Sites.Selected` or SharePoint access to arbitrary external identities.
4. **Secure data layer**: confirm production Azure Functions and SharePoint operational lists, app-only Graph permissions and `API_CLIENT_SECRET`/managed identity are provisioned. The Microsoft login can succeed without these, but first-time server-side profile provisioning will require them.
5. Run the checked-in administrator script (after read-only review) with `pwsh ./scripts/setup-entra-portal.ps1 -Apply -UserAssignmentRequired:$false`; script uses an authorised Azure/Graph admin session, **not** GitHub frontend deployment. Verify the resulting tenant state and test: a personal Microsoft account, an external Entra account, a home-tenant student, an authorised instructor, and an authorised staff member.

The desired-state contract in `azure/portal-entra-contract.json` now sets `enterpriseApplication.userAssignmentRequired=false`, and the setup script defaults to the same policy. Both are source-controlled intent: neither confirms that the live Entra service principal has been updated.

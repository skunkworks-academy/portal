# Skunkworks Academy unified operations workspace

## Scope

The public entry route `https://portal.skunkworksacademy.com/` now presents a branded Microsoft SSO login page. After sign-in, verified staff and instructors use an Academy-branded, DizzyOps-inspired, responsive dashboard. Existing learner-facing `StudentExperience`, course registration and certificate wallet remain available. Existing authorised management forms remain accessible through **Open management tools**.

- Modules: courses, cohorts, recruitment, applications, people, SharePoint, Teams, account/access, and staff-only finance readiness.
- Navigation: keyboard-friendly, mobile drawer, search and responsive cards.
- Data: no locally fabricated enrolments, classes, vacancies, invoices, or metrics. Empty SharePoint lists return empty lists; API failures are not replaced with preset data. Operations not wired to a backend present an explicit readiness state.
- Brand: reuses the Academy website favicon and design tokens (Ink Navy, Skunk Blue, Signal Orange), with a branded footer and responsive light/dark modes.

## Microsoft Entra ID single sign-on

The existing MSAL application is retained. It uses the Microsoft Entra authorization-code flow with PKCE; no secret is embedded in the frontend.

| Setting | Current portal setting |
| --- | --- |
| Tenant ID | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| SPA client ID | `e22672ae-61a6-434e-b135-3360557819ec` |
| Redirect URI | `https://portal.skunkworksacademy.com/` |
| Post-logout URI | `https://portal.skunkworksacademy.com/` |
| API scope | `api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user` |

**Tenant admin checks** before calling SSO production-ready:

1. Confirm **App registrations → Skunkworks Academy Portal → Authentication → Single-page application** includes the exact HTTPS redirect URI above and uses the recommended authorization-code/PKCE flow (implicit grants disabled).
2. Confirm the **Enterprise application** exists in the intended tenant and that authorised users or groups are assigned if **Assignment required** is enabled.
3. Assign the appropriate **Portal.Student**, **Portal.Instructor**, **Portal.Staff**, and **Portal.Admin** app roles. Only accounts with verified staff/admin claims from the configured tenant can open staff-only modules.
4. Confirm **User.Read** delegated permission, and separately consent to the `access_as_user` scope for the backend only if configured.
5. Validate a fresh Microsoft sign-in, returning to the portal, role resolution, reload, sign-out and a second login. Check MFA and Conditional Access through Entra.
6. For true central session controls across Academy subdomains, finish the existing server-side identity BFF infrastructure. The BFF is currently **disabled** in `.env.example`; the present solution is a PKCE-enabled SPA using Microsoft's identity session.

## SharePoint integration

A Microsoft SharePoint connection was used to verify the accessible Academy site:

- **Verified site:** `https://bluemix944.sharepoint.com/sites/Academy`
- **Current checked-in backend defaults:** `SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com` and `SHAREPOINT_SITE_PATH=/sites/InstructorPortal` in `api/config.ts`.
- These are **not the same location**. Do **not** assume the default backend site exists or automatically replace production configuration without confirming the Entra/SharePoint tenant, list schema and Azure Function identity.
- The new dashboard links to the verified Academy site; SharePoint still enforces its own user-level file permissions.

To make the dashboard's record lists operate against SharePoint:

1. Confirm the target SharePoint site and list/field schema for `Courses`, `ClassSessions`, `JobPostings`, applications and profiles. These may need to be provisioned in an appropriately scoped operations site, rather than the existing Academy document library.
2. Configure `SHAREPOINT_HOSTNAME` and `SHAREPOINT_SITE_PATH` **in the backend environment**, pointing to the approved site (and provision the required lists there); never place backend credentials in Vite or the GitHub repository.
3. Grant the Azure Functions service principal `Sites.Selected` or an equivalently minimal approved permission, then apply an explicit site-level grant. Store app secrets in Key Vault or use managed identity where supported.
4. Verify the Azure Function's own identity and Graph permissions, then test `/api/health`, `/api/courses`, `/api/classes`, `/api/jobs` and the authenticated role-restricted endpoints. Unexpected API failure must be investigated, not masked with fake results.
5. For in-portal file search or previews, add a **server-side, RBAC-protected Microsoft Graph endpoint**. At this stage, the SharePoint module is a secure link to the site, not a live document search API.

## Validation and deployment

- Frontend: `npm ci && npm test && npm run build`
- Backend: `npm run build:api`
- CI: GitHub Actions on a pull request targeting `main`.
- GitHub Pages frontend deploy is configured to run after commits land on `main`.
- Test no records, populated records, unavailable API, mobile navigation, colour contrast, Microsoft login/logout, and access denied for non-staff identities.

Production deployment must be confirmed from the GitHub Actions status and actual domain after merging. Connecting a SharePoint account to ChatGPT does not configure the Microsoft Entra app registration or Azure Functions service principal automatically.

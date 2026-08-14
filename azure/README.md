# Skunkworks Academy Portal — Microsoft Entra configuration

This folder defines the production identity contract for the Portal. The source of truth is `portal-entra-contract.json`; `scripts/setup-entra-portal.ps1` inventories and reconciles the live tenant without replacing existing scope or app-role GUIDs.

## Production identity

| Setting | Value |
|---|---|
| Tenant | `SKUNKWORKS` |
| Directory / tenant ID | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| Display name | `Skunkworks Academy Portal` |
| Application / client ID | `e22672ae-61a6-434e-b135-3360557819ec` |
| Application object ID | `5546429d-1373-49ab-b587-67deba7e84c0` |
| Application ID URI | `api://e22672ae-61a6-434e-b135-3360557819ec` |
| Delegated API scope | `api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user` |
| Access-token version | `2` |
| Production SPA redirect | `https://portal.skunkworksacademy.com/` |
| Local SPA redirect | `http://localhost:5173/` |

Retired IDs `21f093b0-e91a-4f62-ad71-2dee1e0cbc20` and `8b1e77b3-3017-4c54-8ab3-0e4864511b55` are not production identities and must not be used in deployment variables.

## Safe execution

Run the inventory first:

```powershell
pwsh ./scripts/setup-entra-portal.ps1
```

Review `artifacts/entra-portal-inventory.json`, then apply:

```powershell
pwsh ./scripts/setup-entra-portal.ps1 `
    -Apply `
    -ConfigureRoleGroups `
    -GrantGraphApplicationConsent `
    -ConfigureGitHubVariables
```

The script requires an explicit `-Apply`, refuses the wrong tenant, preserves live role/scope GUIDs, and verifies the resulting application and service principal.

## Authentication platform

- Platform: Single-page application.
- Flow: OAuth 2.0 authorization code with PKCE through MSAL.
- Implicit access-token and ID-token issuance: disabled.
- Browser secret: none.
- Redirect URIs must be an exact case-sensitive match, including the trailing slash.

## Protected API

- Application ID URI: `api://e22672ae-61a6-434e-b135-3360557819ec`.
- Delegated scope value: `access_as_user`.
- Frontend request: `api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user`.
- API accepts audiences `e22672ae-61a6-434e-b135-3360557819ec` and `api://e22672ae-61a6-434e-b135-3360557819ec`.

## Microsoft Graph

The app requests:

- delegated `User.Read`;
- application `Sites.Selected`.

`Sites.Selected` tenant consent grants no SharePoint content access by itself. A SharePoint or Global Administrator must separately grant the application `write` access to `skunkworksacademy.sharepoint.com:/sites/InstructorPortal`. See `docs/ENTRA_APPLICATION_SETUP.md`.

The confidential backend credential belongs only in Azure Function App settings or Key Vault. Never expose it in a `VITE_*` variable.

## Enterprise Application

The service principal must be enabled and should require assignment for the current role-gated portal.

| App role | Security group |
|---|---|
| `Portal.Student` | `Skunkworks Academy Portal - Learners` |
| `Portal.Instructor` | `Skunkworks Academy Portal - Instructors` |
| `Portal.Staff` | `Skunkworks Academy Portal - Operations` |
| `Portal.Admin` | `Skunkworks Academy Portal - Administrators` |
| `Portal.Automation` | trusted application service principals only |

Use `scripts/add-portal-group-member.ps1` to add a user to one of the role groups.

## Runtime variables

```text
VITE_MSAL_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
VITE_API_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
VITE_APPLICATION_ID_URI=api://e22672ae-61a6-434e-b135-3360557819ec
VITE_MSAL_AUTHORITY=https://login.microsoftonline.com/338a8916-80d9-467c-a94a-7f61d04ef7d5
VITE_API_SCOPE=api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user
VITE_SKUNKWORKS_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
```

Azure Function App:

```text
ENTRA_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
API_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
SPA_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
GRAPH_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
```

## Public registration boundary

This workforce-tenant Enterprise Application does not by itself provide a complete consumer sign-up system. Public self-registration and social identities should use Microsoft Entra External ID, with a server-side workflow for learner records and eligible entitlements.

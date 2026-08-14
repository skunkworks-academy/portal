# Skunkworks Academy Portal

Production portal for students, instructors and staff operations. The portal provides a single Academy front door for Microsoft Entra sign-in, role-based workspaces, course discovery, class registration, instructor applications, profile capture, API health checks and staff readiness.

## Current Rebuild Scope

- Frontend: Vite React SPA hosted at `https://portal.skunkworksacademy.com/`.
- Identity: Microsoft Entra ID using MSAL browser and authorization code flow with PKCE.
- Tenant: `SKUNKWORKS` (`skunkworks.digital`).
- API: Azure Functions at `/api`, issuing role-gated operations backed by Microsoft Graph and SharePoint.
- Data: SharePoint site `/sites/InstructorPortal` for courses, classes, applications, profiles and onboarding records.

## Microsoft Entra Application Details

| Field | Value |
|---|---|
| Display name | Skunkworks Academy Portal |
| Application / client ID | `e22672ae-61a6-434e-b135-3360557819ec` |
| Object ID | `5546429d-1373-49ab-b587-67deba7e84c0` |
| Directory / tenant ID | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| Primary domain | `skunkworks.digital` |
| Supported account types | Accounts in any Microsoft Entra ID tenant and personal Microsoft accounts |
| SPA redirect URI | `https://portal.skunkworksacademy.com/` |
| Local SPA redirect URI | `http://localhost:5173/` |
| Post-logout redirect URI | `https://portal.skunkworksacademy.com/` |
| Application ID URI | `api://e22672ae-61a6-434e-b135-3360557819ec` |
| Delegated API scope | `api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user` |

The SPA must never contain a client secret. Browser authentication uses PKCE. A client secret is required only if the Azure Functions backend uses application permissions to Microsoft Graph or SharePoint.

## Required Entra Portal Configuration

In **App registrations → Skunkworks Academy Portal → Authentication**:

1. Add platform **Single-page application**.
2. Add redirect URIs:
   - `https://portal.skunkworksacademy.com/`
   - `http://localhost:5173/`
3. Set logout URL to `https://portal.skunkworksacademy.com/` where supported.
4. Leave implicit grant disabled for a modern MSAL SPA using authorization code flow with PKCE.

In **API permissions** add delegated Microsoft Graph permissions:

- `openid`
- `profile`
- `email`
- `offline_access`
- `User.Read`

Grant admin consent where tenant policy requires it.

In **Expose an API**:

1. Set Application ID URI to `api://e22672ae-61a6-434e-b135-3360557819ec`.
2. Add delegated scope `access_as_user`.
3. Add the SPA client application as an authorized client application when the API and SPA use separate registrations. When using this single registration for both SPA and API, ensure the delegated scope exists before the frontend requests it.

In **Enterprise applications → Skunkworks Academy Portal → Properties**:

- Set **Assignment required?** to `No` for open learner sign-in, or keep it `Yes` only if every user/group will be explicitly assigned.
- Ensure the service principal is enabled for users to sign in.

## Role Model

For role-based portal access, define and assign these application roles on the Enterprise Application:

- `Portal.Student`
- `Portal.Instructor`
- `Portal.Staff`
- `Portal.Admin`

The GUI reads the `roles` claim and routes the signed-in user to the appropriate workspace. Users without a role default to the Student workspace unless tenant assignment policy blocks sign-in.

## Frontend Environment

```text
VITE_MSAL_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
VITE_API_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
VITE_APPLICATION_ID_URI=api://e22672ae-61a6-434e-b135-3360557819ec
VITE_MSAL_AUTHORITY=https://login.microsoftonline.com/338a8916-80d9-467c-a94a-7f61d04ef7d5
VITE_API_SCOPE=api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user
VITE_API_BASE_URL=https://skunkworks-academy-portal-api-za.azurewebsites.net/api
VITE_SKUNKWORKS_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
```

## Azure Function App Settings

```text
ENTRA_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
API_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
SPA_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec
API_CLIENT_SECRET=<ONLY_IF_BACKEND_APP_PERMISSIONS_ARE_USED>
GRAPH_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
ALLOWED_ORIGINS=http://localhost:5173,https://portal.skunkworksacademy.com,https://skunkworks-academy.github.io
```

## Authentication Fixes Included

- Replaces the previous tenant and client IDs with the active SKUNKWORKS tenant and portal application.
- Blocks retired portal application IDs from deployment overrides.
- Processes `handleRedirectPromise()` before React renders so the returned account becomes active immediately.
- Persists the MSAL account in `localStorage` to reduce login loops across reloads.
- Uses `navigateToLoginRequestUrl: true` so users return to the page that initiated sign-in.
- Keeps interactive login limited to OIDC scopes. The custom API scope is requested only when the frontend calls the protected API.
- Uses the fully qualified API scope rather than `/access_as_user`.

## Common Errors

### AADSTS50011 — redirect URI mismatch

The URI in Entra must exactly match:

```text
https://portal.skunkworksacademy.com/
```

The trailing slash matters.

### AADSTS700016 — application not found

Verify the request uses:

```text
e22672ae-61a6-434e-b135-3360557819ec
```

and authority:

```text
https://login.microsoftonline.com/338a8916-80d9-467c-a94a-7f61d04ef7d5
```

### AADSTS70011 — invalid scope

Use:

```text
api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user
```

Do not use `/access_as_user` by itself.

### AADSTS50105 — user not assigned

Either assign the user/group to the Enterprise Application or set **Assignment required?** to `No`.

### Login succeeds but portal still appears signed out

Clear browser storage for `portal.skunkworksacademy.com`, then sign in again. The updated bootstrap now processes the redirect response before rendering and sets the active account.

## Local Development

```bash
npm install
npm run dev
npm run api:start
```

Build and validate:

```bash
npm test
npm run validate:global-nav
npm run build
npm run build:api
```

## API Health Check

```text
https://skunkworks-academy-portal-api-za.azurewebsites.net/api/health
```

Expected healthy shape:

```json
{
  "ok": true,
  "service": "skunkworks-academy-portal-api",
  "missingSettings": []
}
```

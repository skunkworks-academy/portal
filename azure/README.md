# Skunkworks Academy Portal — Microsoft Entra configuration

This folder documents the target Microsoft Entra configuration for the Skunkworks Academy Portal.

The repo cannot apply these settings to Azure by itself. Use these files as the source of truth when updating the Azure app registrations:

- `portal-spa-app-manifest.json` — frontend Vite/React SPA app registration.
- `portal-api-app-manifest.json` — Azure Functions API app registration, exposed API scope, and portal app roles.

## Application registrations

### 1. Skunkworks Academy Portal

Use this as the SPA/public client app.

| Setting | Value |
|---|---|
| Application client ID | `21f093b0-e91a-4f62-ad71-2dee1e0cbc20` |
| Tenant ID | `972e8de4-e365-43a3-99ec-c86a0cc249e8` |
| Platform | Single-page application |
| Redirect URI | `https://portal.skunkworksacademy.com/` |
| Redirect URI | `https://skunkworks-academy.github.io/portal/` |
| Redirect URI | `http://localhost:5173/` |
| API permission | `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user` |

Recommended runtime environment:

```text
VITE_MSAL_CLIENT_ID=21f093b0-e91a-4f62-ad71-2dee1e0cbc20
VITE_MSAL_AUTHORITY=https://login.microsoftonline.com/972e8de4-e365-43a3-99ec-c86a0cc249e8
VITE_API_SCOPE=api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
VITE_API_BASE_URL=https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api
VITE_SKUNKWORKS_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
```

### 2. Skunkworks Academy Portal API

Use this as the protected Azure Functions/API app.

| Setting | Value |
|---|---|
| Application client ID | `8b1e77b3-3017-4c54-8ab3-0e4864511b55` |
| Application ID URI | `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55` |
| Exposed scope | `access_as_user` |
| Runtime access token version | 2 |

Recommended Azure Function settings:

```text
ENTRA_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
API_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
API_CLIENT_SECRET=<API_CLIENT_SECRET>
SPA_CLIENT_ID=21f093b0-e91a-4f62-ad71-2dee1e0cbc20
GRAPH_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
ALLOWED_ORIGINS=http://localhost:5173,https://portal.skunkworksacademy.com,https://skunkworks-academy.github.io
```

## App roles

Assign these roles on the **Enterprise Application** for the API app registration.

| Role value | Assign to | Portal access |
|---|---|---|
| `Portal.Student` | Learners/students | Course discovery, class registration, learner resources, profile |
| `Portal.Instructor` | Instructor candidates and active instructors | Jobs, applications, instructor profile, documents, assigned classes |
| `Portal.Staff` | Training delivery and operations staff | Jobs, applications, instructor/student monitoring, scheduling |
| `Portal.Admin` | Portal administrators | Full staff/admin operations |

The frontend reads role claims from the signed-in user's ID token and the API enforces role claims from the access token.

## User login flow

1. User opens `https://portal.skunkworksacademy.com/`.
2. User selects Student, Instructor, or Staff entry path.
3. MSAL redirects to the Skunkworks tenant authority.
4. Microsoft Entra returns tokens with assigned app-role claims.
5. The portal GUI routes the user to the correct workspace.
6. Azure Functions validates the access token audience and role claims before accepting write operations.

## Validation checklist

- Confirm `VITE_MSAL_CLIENT_ID` is the SPA client ID: `21f093b0-e91a-4f62-ad71-2dee1e0cbc20`.
- Confirm `VITE_API_SCOPE` points to the API app ID URI: `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user`.
- Confirm the Function App has `API_CLIENT_SECRET` populated.
- Confirm users are assigned app roles on the API Enterprise Application.
- Confirm `/api/health` returns `ok: true` and `missingSettings: []`.
- Confirm Staff-only screens return 403 for users without `Portal.Staff` or `Portal.Admin`.

## Important

If these roles or scope already exist in Azure, preserve the existing GUIDs. Do not delete and recreate production app roles if users are already assigned, because deleting app roles can break existing Enterprise Application assignments.

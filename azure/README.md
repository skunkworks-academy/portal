# Skunkworks Academy Portal — Microsoft Entra configuration

This folder documents the target Microsoft Entra configuration for the Skunkworks Academy Portal.

The active production Entra app registration is **Skunkworks Academy Portal API**. It currently carries both responsibilities:

- SPA sign-in client for the Vite/React portal.
- Protected API resource exposing `access_as_user` for the Azure Functions API.

The previous SPA client ID `21f093b0-e91a-4f62-ad71-2dee1e0cbc20` must not be used for production sign-in unless that app registration is recreated or installed in the Skunkworks Africa tenant. Using that missing client ID causes `AADSTS700016`.

## Active application registration

| Setting | Value |
|---|---|
| Display name | `Skunkworks Academy Portal API` |
| Application / client ID | `8b1e77b3-3017-4c54-8ab3-0e4864511b55` |
| Object ID | `3646dd6d-5ed7-4ea6-96b7-3c8f45fb93c9` |
| Directory / tenant ID | `972e8de4-e365-43a3-99ec-c86a0cc249e8` |
| Supported account types | All Microsoft account users |
| Application ID URI | `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55` |
| Delegated API scope | `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user` |
| Runtime access token version | `2` |
| Production redirect URI | `https://portal.skunkworksacademy.com/` |
| Verification redirect URI | `https://verify.skunkworksacademy.com/` |
| Local redirect URI | `http://localhost:3000/` |
| Vite local redirect URI | `http://localhost:5173/` |

## Runtime environment

Frontend `.env` and static-site deployment variables:

```text
VITE_MSAL_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
VITE_API_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
VITE_APPLICATION_ID_URI=api://8b1e77b3-3017-4c54-8ab3-0e4864511b55
VITE_MSAL_AUTHORITY=https://login.microsoftonline.com/972e8de4-e365-43a3-99ec-c86a0cc249e8
VITE_API_SCOPE=api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
VITE_API_BASE_URL=https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api
VITE_SKUNKWORKS_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
```

Azure Function App settings:

```text
ENTRA_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
API_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
API_CLIENT_SECRET=<API_CLIENT_SECRET>
SPA_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
GRAPH_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://portal.skunkworksacademy.com,https://verify.skunkworksacademy.com,https://skunkworks-academy.github.io
```

## Required Entra portal changes

Apply these in **Microsoft Entra admin center > App registrations > Skunkworks Academy Portal API**.

### Authentication

Platform type: **Single-page application**

Registered redirect URIs:

```text
https://portal.skunkworksacademy.com/
https://verify.skunkworksacademy.com/
http://localhost:3000/
http://localhost:5173/
```

Do not add SPA client secrets. The browser portal uses Authorization Code Flow with PKCE through MSAL.

### Expose an API

Application ID URI:

```text
api://8b1e77b3-3017-4c54-8ab3-0e4864511b55
```

Delegated scope:

```text
access_as_user
```

Full scope requested by the portal:

```text
api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
```

If the scope already exists, preserve its existing GUID. Do not delete and recreate production scopes unless you are prepared to re-consent clients and repair assignments.

### Enterprise Application roles

Assign these roles on the **Enterprise Application** for the active app registration.

| Role value | Assign to | Portal access |
|---|---|---|
| `Portal.Student` | Learners/students | Course discovery, class registration, learner resources, profile |
| `Portal.Instructor` | Instructor candidates and active instructors | Jobs, applications, instructor profile, documents, assigned classes |
| `Portal.Staff` | Training delivery and operations staff | Jobs, applications, instructor/student monitoring, scheduling |
| `Portal.Admin` | Portal administrators | Full staff/admin operations |

The frontend reads role claims from the signed-in user's ID token and the API enforces role claims from the access token.

## AADSTS700016 fix

`AADSTS700016` means the token request is using an application/client ID that Microsoft Entra cannot find in the selected tenant. For this portal, remove this stale value from all deployment settings:

```text
21f093b0-e91a-4f62-ad71-2dee1e0cbc20
```

Use this value instead:

```text
8b1e77b3-3017-4c54-8ab3-0e4864511b55
```

The frontend has a defensive fallback that ignores the retired `21f093b0...` client ID and uses the active `8b1e77b3...` registration.

## AADSTS70011 scope fix

`/access_as_user` is not a valid standalone Microsoft Entra scope. Deploy the full Application ID URI scope:

```text
api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
```

The frontend normalizes common bad values such as `/access_as_user`, `access_as_user`, or `openid profile email offline_access /access_as_user` into the correct API scope before MSAL redirects.

## Validation checklist

1. Confirm `VITE_MSAL_CLIENT_ID` is `8b1e77b3-3017-4c54-8ab3-0e4864511b55` or unset.
2. Confirm no deployment secret, pipeline variable, Static Web App setting, Vercel setting, or Azure App Service setting still contains `21f093b0-e91a-4f62-ad71-2dee1e0cbc20`.
3. Confirm `VITE_API_SCOPE` is `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user`.
4. Confirm the Authentication page includes `https://portal.skunkworksacademy.com/` as a SPA redirect URI.
5. Confirm `/api/health` returns `ok: true` and `missingSettings: []`.
6. Confirm users are assigned app roles on the active Enterprise Application.
7. Confirm Staff-only screens return 403 for users without `Portal.Staff` or `Portal.Admin`.

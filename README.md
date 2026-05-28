# Skunkworks Academy Instructor Portal

Production portal for instructor job postings, public applications, admin review, onboarding tasks, and SharePoint-backed records.

## Architecture

- Frontend: Vite React SPA hosted on GitHub Pages at `https://portal.skunkworksacademy.com`.
- Identity: Microsoft Entra ID with `AzureADandPersonalMicrosoftAccount` and MSAL auth code + PKCE.
- API: Azure Functions validating SPA access tokens and writing to Microsoft Graph.
- Data: SharePoint site `/sites/InstructorPortal` with lists and document libraries.

## Required Entra Setup

Create `Skunkworks Academy Portal` as a SPA app registration.

- Supported account types: accounts in any organizational directory and personal Microsoft accounts.
- Redirect URIs: `https://portal.skunkworksacademy.com/`, `https://skunkworks-academy.github.io/portal/`, `http://localhost:5173/`.
- API permission: delegated permission for `api://<API_CLIENT_ID>/access_as_user`.

Create `Skunkworks Academy Portal API` as the API app registration.

- Expose API scope: `access_as_user`.
- App role: `Portal.Admin`, assign it to Skunkworks admin users on the Enterprise Application.
- Graph application permission: `Sites.Selected`, granted admin consent.
- Grant the API service principal write access to the `InstructorPortal` site.

## Configuration

Frontend `.env`:

```text
VITE_MSAL_CLIENT_ID=<SPA_CLIENT_ID>
VITE_API_SCOPE=api://<API_CLIENT_ID>/access_as_user
VITE_API_BASE_URL=https://<function-app>.azurewebsites.net/api
VITE_SKUNKWORKS_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
```

Azure Function settings:

```text
ENTRA_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
API_CLIENT_ID=<API_CLIENT_ID>
API_CLIENT_SECRET=<API_CLIENT_SECRET>
SPA_CLIENT_ID=<SPA_CLIENT_ID>
GRAPH_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
ALLOWED_ORIGINS=https://portal.skunkworksacademy.com,https://skunkworks-academy.github.io,http://localhost:5173
```

## SharePoint Provisioning

Create a dedicated SharePoint site named `InstructorPortal`, then run:

```bash
npm run provision:sharepoint
```

The script creates `JobPostings`, `Applications`, `Candidates`, `OnboardingTasks`, `AuditEvents`, `ApplicantUploads`, and `InstructorDocuments`.

## Development

```bash
npm install
npm run dev
npm run api:start
```

Build frontend:

```bash
npm run build
```

Build Azure Functions:

```bash
npm run build:api
```

## Production Checks

After deploying the API workflow, verify that the Function App has indexed routes:

```text
https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api/health
```

The response should include:

```json
{
  "ok": true,
  "missingSettings": []
}
```

If `missingSettings` includes `apiClientSecret`, create a new client secret in the `Skunkworks Academy Portal API` app registration and add the secret value to the Function App setting `API_CLIENT_SECRET`. Restart the Function App after saving.

The public jobs endpoint is:

```text
https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api/jobs
```

If SharePoint is not provisioned yet, the API returns preset public jobs so the portal remains usable while setup finishes. Admin and application submission flows still require the SharePoint site, lists, libraries, Graph permissions, and `API_CLIENT_SECRET`.

## GitHub Secrets

Frontend deployment requires:

```text
VITE_MSAL_CLIENT_ID
VITE_API_SCOPE
VITE_API_BASE_URL
```

API deployment requires:

```text
AZURE_FUNCTIONAPP_NAME
AZURE_FUNCTIONAPP_PUBLISH_PROFILE
```

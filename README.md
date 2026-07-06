# Skunkworks Academy Portal

Production portal for students, instructors and staff operations. The rebuilt portal provides a single Academy front door for Microsoft Entra sign-in, role-based workspaces, course discovery, class registration, instructor applications, profile capture, API health checks and staff readiness.

## Current Rebuild Scope

- Frontend: Vite React SPA hosted at `https://portal.skunkworksacademy.com/`.
- Navigation: global Skunkworks Academy menu with Home, Self-paced, Portal, Labs, Plans, Purchase, Jobs, Docs and IBM links.
- Student account navigation: PortSwigger-style sidebar for Personal Details, Learning, Certifications, Jobs, Connections, Subscriptions, Order History and Reports.
- Instructor workspace interface: command-centre sidebar for Dashboard, Instructor Profile, My Classes, My Applications, Jobs, Learners, Course Materials, Assessments and Reports.
- Staff workspace interface: operations command-centre sidebar for Dashboard, Operations, Jobs, Applications, Instructors, Students, Scheduling, Resources, Settings and Reports.
- Identity: Microsoft Entra ID with MSAL browser authentication.
- API: Azure Functions at `/api`, issuing role-gated operations backed by Microsoft Graph and SharePoint.
- Data: SharePoint site `/sites/InstructorPortal` for courses, classes, applications, profiles and onboarding records.
- Resilience: public course, class and job fallbacks keep the portal usable while API or SharePoint setup is incomplete.

## Microsoft Entra Application Details

The portal is aligned to the provided Enterprise/App Registration record:

| Field | Value |
|---|---|
| Display name | Skunkworks Academy Portal API |
| Application / client ID | `8b1e77b3-3017-4c54-8ab3-0e4864511b55` |
| Object ID | `3646dd6d-5ed7-4ea6-96b7-3c8f45fb93c9` |
| Directory / tenant ID | `972e8de4-e365-43a3-99ec-c86a0cc249e8` |
| Supported account types | All Microsoft account users |
| Client credentials | 0 certificates, 2 client secrets configured in Entra |
| Redirect URI | `https://portal.skunkworksacademy.com/` |
| Application ID URI | `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55` |
| Delegated API scope | `api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user` |

The SPA never exposes client-secret values. Client secrets remain in the Azure Function App setting `API_CLIENT_SECRET` only.

## Role Model

Student workspace sidebar:

```text
Personal Details
Learning
Certifications
Jobs
Connections
Subscriptions
Order History
Reports
```

Instructor workspace sidebar:

```text
Dashboard
Instructor Profile
My Classes
My Applications
Jobs
Learners
Course Materials
Assessments
Reports
```

Staff workspace sidebar:

```text
Dashboard
Operations
Jobs
Applications
Instructors
Students
Scheduling
Resources
Settings
Reports
```

Staff operational API writes require `Portal.Admin` or `Portal.Staff` app role assignment in the Enterprise Application. Instructor application flows require `Portal.Instructor`. Student registration requires `Portal.Student`, `Portal.Staff` or `Portal.Admin`.

## Required Environment

Frontend `.env`:

```text
VITE_MSAL_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
VITE_API_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
VITE_APPLICATION_ID_URI=api://8b1e77b3-3017-4c54-8ab3-0e4864511b55
VITE_API_SCOPE=api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
VITE_API_BASE_URL=https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api
VITE_SKUNKWORKS_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
```

Azure Function App settings:

```text
ENTRA_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
API_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
SPA_CLIENT_ID=8b1e77b3-3017-4c54-8ab3-0e4864511b55
API_CLIENT_SECRET=<SECRET_VALUE_FROM_ENTRA>
GRAPH_TENANT_ID=972e8de4-e365-43a3-99ec-c86a0cc249e8
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
ALLOWED_ORIGINS=http://localhost:5173,https://portal.skunkworksacademy.com,https://skunkworks-academy.github.io
```

## Scope Fix for AADSTS70011

`/access_as_user` is not a valid standalone Microsoft Entra scope. The delegated API permission must be requested as a fully qualified Application ID URI scope:

```text
api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
```

The frontend now normalizes common bad values such as `/access_as_user`, `access_as_user`, or an accidentally pasted scope string like `openid profile email offline_access /access_as_user` into the correct API scope before MSAL redirects.

Do not deploy this:

```text
VITE_API_SCOPE=/access_as_user
```

Deploy this:

```text
VITE_API_SCOPE=api://8b1e77b3-3017-4c54-8ab3-0e4864511b55/access_as_user
```

## Sign-in Fix for AADSTS700016

The portal must not request sign-in or API tokens for the retired or missing Entra application ID:

```text
21f093b0-e91a-4f62-ad71-2dee1e0cbc20
```

The frontend now guards the MSAL client ID, API client ID, Application ID URI and API scope against that missing application ID. If any deployed `VITE_*` environment variable still references it, the SPA falls back to the canonical Skunkworks Academy Portal API application:

```text
8b1e77b3-3017-4c54-8ab3-0e4864511b55
```

Remove stale deployment settings that contain `21f093b0-e91a-4f62-ad71-2dee1e0cbc20`, redeploy the frontend, then clear browser session storage before signing in again.

For usable GUI accounts, assign users or groups to the correct app roles on the Enterprise Application:

- `Portal.Student`
- `Portal.Instructor`
- `Portal.Staff`
- `Portal.Admin`

The GUI reads role claims from the signed-in account and routes users to the matching workspace.

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
npm run teams:icons
npm run teams:validate
```

## API Health Check

After deploying the Azure Function App, verify:

```text
https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api/health
```

Expected healthy shape:

```json
{
  "ok": true,
  "service": "skunkworks-academy-portal-api",
  "missingSettings": []
}
```

If `missingSettings` includes `apiClientSecret`, create a new secret in the `Skunkworks Academy Portal API` app registration and add only the secret value to `API_CLIENT_SECRET`. Restart the Function App after saving.

## SharePoint Provisioning

Create the SharePoint site `/sites/InstructorPortal`, then run:

```bash
npm run provision:sharepoint
```

The provisioning script creates the operational lists and document libraries for job postings, courses, class sessions, registrations, applications, profiles, candidates, onboarding tasks, audit events and uploads.

## Verification Checklist

1. Signed-out users see the rebuilt branded landing page and global Academy menu.
2. Microsoft sign-in uses client ID `8b1e77b3-3017-4c54-8ab3-0e4864511b55` unless explicitly overridden through the guarded auth config.
3. The portal never requests application ID `21f093b0-e91a-4f62-ad71-2dee1e0cbc20` for MSAL sign-in or API scope consent.
4. The Enterprise Application panel displays tenant ID, object ID, Application ID URI, scope, redirect URI and authority.
5. `/api/health` displays missing Azure Function settings when configuration is incomplete.
6. Students can register for classes when assigned the correct Entra app role.
7. Instructors can apply for instructor jobs and view submitted applications.
8. Staff users with `Portal.Admin` or `Portal.Staff` can create job postings and class schedules.
9. The student account sidebar shows Personal Details, Learning, Certifications, Jobs, Connections, Subscriptions, Order History and Reports.
10. The instructor workspace shows Dashboard, Instructor Profile, My Classes, My Applications, Jobs, Learners, Course Materials, Assessments and Reports.
11. The staff workspace shows Dashboard, Operations, Jobs, Applications, Instructors, Students, Scheduling, Resources, Settings and Reports.
12. The global navigation validator passes before build.
13. No deployed environment uses `/access_as_user` as the API scope.

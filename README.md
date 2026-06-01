# Skunkworks Academy Portal

Production portal for students, instructors, and staff. The app supports course discovery, class registration, instructor job applications, instructor class self-assignment, staff job posting, admin review, onboarding tasks, profile editing, Microsoft Entra authentication, Teams packaging, and SharePoint-backed records.

## Architecture

- Frontend: Vite React SPA hosted on GitHub Pages at `https://portal.skunkworksacademy.com`.
- Identity: Microsoft Entra ID with MSAL auth code + PKCE.
- Role source: Microsoft Entra app roles, with a development-only local role preview in Vite dev mode.
- API: Azure Functions validating SPA access tokens and writing to Microsoft Graph.
- Data: SharePoint site `/sites/InstructorPortal` with lists and document libraries.
- Academic records: `Courses`, `ClassSessions`, and `ClassRegistrations` lists for student registration and staff scheduling.
- Profile storage: `PortalProfiles` SharePoint list plus `InstructorDocuments` for instructor CV/resume files.
- Teams: Personal Teams app scaffold in `teams/manifest.json`.

## Role Model

Student workspace:

```text
Dashboard
Courses
My Classes
Register
Resources
Profile
```

Students can view courses, view enrolled classes, register for available classes, update their own profile, and see student resources. They should not see instructor jobs, instructor applications, staff dashboards, scheduling admin tools, instructor profile monitoring, student monitoring, or job posting tools.

Instructor workspace:

```text
Dashboard
Jobs
My Applications
My Classes
Resources
Profile
```

Instructors can view jobs, apply for jobs, manage applications, edit their profile, upload CV or resume details, monitor classes, self-assign pending classes, and see instructor resources.

Staff workspace:

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
```

Staff can post instructor jobs, manage postings, review applications, monitor onboarding, view instructor profiles, monitor student profiles, create and update class schedules, assign instructors, and monitor students. Staff operational API writes require the `Portal.Admin` or staff app role from Microsoft Entra.

## Required Entra Setup

Create `Skunkworks Academy Portal` as a SPA app registration.

- Supported account types: accounts in any organizational directory and personal Microsoft accounts.
- Redirect URIs: `https://portal.skunkworksacademy.com/`, `https://skunkworks-academy.github.io/portal/`, `http://localhost:5173/`.
- API permission: delegated permission for `api://<API_CLIENT_ID>/access_as_user`.

Create `Skunkworks Academy Portal API` as the API app registration.

- Expose API scope: `access_as_user`.
- App roles: `Portal.Student`, `Portal.Instructor`, `Portal.Staff`, and `Portal.Admin`.
- Assign `Portal.Student` to student users who can register for classes.
- Assign `Portal.Instructor` to instructor users who need application/profile document workflows.
- Assign `Portal.Admin` or `Portal.Staff` to Skunkworks staff users on the Enterprise Application.
- Graph application permission: `Sites.Selected`, granted admin consent.
- Grant the API service principal write access to the `InstructorPortal` site.

## Microsoft Teams

The Teams manifest scaffold is in `teams/manifest.json`. Before uploading to Teams Admin Center, replace placeholder IDs and add Teams PNG icons:

```text
teams/manifest.json
teams/color.png
teams/outline.png
```

See `teams/README.md` for the packaging checklist and Entra role guidance.

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

The script creates `JobPostings`, `Courses`, `ClassSessions`, `ClassRegistrations`, `Applications`, `PortalProfiles`, `Candidates`, `OnboardingTasks`, `AuditEvents`, `ApplicantUploads`, and `InstructorDocuments`.

When `Courses` or `ClassSessions` are empty, provisioning seeds starter academic records:

```text
Applied AI Tools
Security Analyst Academy
Cloud Practitioner Track
```

Staff can replace or extend these through the Scheduling workspace. If a student registers against a fallback class before seeded sessions exist, the API materializes that fallback into `ClassSessions` first so registrations, enrollment counts, and later staff schedule edits stay attached to the same SharePoint record. Instructor class assignment uses the same class update path, so pending fallback classes can be materialized and assigned from the instructor workspace.

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

## Verification Checklist

```text
1. Signed-out users see the branded public landing page with Student, Instructor, and Staff entry paths.
2. Student role sees only Dashboard, Courses, My Classes, Register, Resources, and Profile.
3. Student users with Portal.Student can register for open classes through POST /api/classes/{id}/register.
4. Instructor role sees only Dashboard, Jobs, My Applications, My Classes, Resources, and Profile.
5. Instructor users with Portal.Instructor can assign themselves to pending classes through POST /api/classes/{id}/assign-instructor.
6. Staff role sees Operations, Applications, Instructors, Students, Scheduling, Resources, and Settings.
7. Staff write and monitoring actions are locked unless Microsoft Entra grants staff/admin role claims.
8. Profile editing loads from GET /api/me/profile and saves through PATCH /api/me/profile.
9. Instructor CV/resume uploads are stored in InstructorDocuments and linked from PortalProfiles.
10. Staff monitoring views load instructor and student profile data from GET /api/admin/profiles.
11. Staff scheduling loads classes from GET /api/classes, creates classes through POST /api/admin/classes, and updates schedules/instructors through PATCH /api/admin/classes/{id}.
12. Staff job management loads all postings from GET /api/admin/jobs and updates postings through PATCH /api/admin/jobs/{id}.
13. Resources content changes by role.
14. Browser metadata and favicon show Skunkworks Academy Portal.
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

The health route list should include:

```text
GET /api/courses
GET /api/classes
POST /api/classes/{id}/register
POST /api/classes/{id}/assign-instructor
GET /api/me/classes
GET /api/me/profile
PATCH /api/me/profile
GET /api/admin/profiles
GET /api/admin/class-registrations
POST /api/admin/classes
PATCH /api/admin/classes/{id}
GET /api/admin/jobs
POST /api/admin/jobs
PATCH /api/admin/jobs/{id}
```

If `missingSettings` includes `apiClientSecret`, create a new client secret in the `Skunkworks Academy Portal API` app registration and add the secret value to the Function App setting `API_CLIENT_SECRET`. Restart the Function App after saving.

The public jobs endpoint is:

```text
https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api/jobs
```

If SharePoint is not provisioned yet, the API returns preset public jobs so the portal remains usable while setup finishes. Authenticated admin, profile, class registration, class assignment, and application submission flows still require the SharePoint site, lists, libraries, Graph permissions, and `API_CLIENT_SECRET`.

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

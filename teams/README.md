# Microsoft Teams and Entra Setup

This folder contains the Teams app manifest scaffold for packaging the Skunkworks Academy Portal as a personal Teams app.

Before uploading the package to Teams Admin Center, replace the placeholder IDs in `manifest.json`:

```text
id=<Teams app package id>
webApplicationInfo.id=<SPA app registration client id>
webApplicationInfo.resource=api://<API app registration client id>
```

Required Microsoft Entra app roles:

```text
Portal.Student
Portal.Instructor
Portal.Staff
Portal.Admin
```

Recommended production role source order:

```text
1. Entra app role claim on the signed-in user token
2. Entra group claim mapped to a portal role
3. Backend database role mapping for exceptions
4. Development-only local role override
```

Teams configuration checklist:

```text
1. Add https://portal.skunkworksacademy.com/ as a SPA redirect URI.
2. Add https://skunkworks-academy.github.io/portal/ if GitHub Pages remains a deployment target.
3. Expose the API scope api://<API_CLIENT_ID>/access_as_user.
4. Grant the SPA permission to request the API scope.
5. Assign Portal.Admin or Portal.Staff through the Enterprise Application for staff users.
6. Add the portal domain to validDomains in the Teams manifest.
7. Create 32x32 outline.png and 192x192 color.png icons before packaging for Teams.
8. Zip manifest.json, outline.png, and color.png for upload to Teams Admin Center.
```

Staff workflows inside Teams should use the same portal screens and server-side API authorization. The Teams package should not grant permissions by itself; Microsoft Entra app roles remain the source of authority.

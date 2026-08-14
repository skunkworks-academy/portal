# Skunkworks Academy Portal — Entra application setup

The portal uses one current production identity contract:

| Setting | Value |
|---|---|
| Tenant ID | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| App/client ID | `e22672ae-61a6-434e-b135-3360557819ec` |
| Application ID URI | `api://e22672ae-61a6-434e-b135-3360557819ec` |
| Delegated scope | `api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user` |
| Production SPA redirect | `https://portal.skunkworksacademy.com/` |
| Local SPA redirect | `http://localhost:5173/` |

The machine-readable contract is `azure/portal-entra-contract.json`. The setup script preserves live role and scope GUIDs when their values already exist.

## 1. Prerequisites

Use PowerShell 7 and Azure CLI. Sign in with an administrator who can manage app registrations, enterprise applications, groups, app-role assignments, and tenant-wide admin consent.

```powershell
az version
az login --tenant "338a8916-80d9-467c-a94a-7f61d04ef7d5"
az account show --query "{tenant:tenantId,subscription:id,name:name}" --output table
```

Use `-UseDeviceCode` if the browser login window is hidden.

## 2. Run the read-only inventory first

```powershell
pwsh ./scripts/setup-entra-portal.ps1
```

This creates `artifacts/entra-portal-inventory.json` and does not modify Entra.

Review these values in the report:

- connected tenant is `338a8916-80d9-467c-a94a-7f61d04ef7d5`;
- app/client ID is `e22672ae-61a6-434e-b135-3360557819ec`;
- both redirect URIs are present;
- `access_as_user` is exposed;
- all Portal roles exist;
- the enterprise application is enabled.

## 3. Apply the full Portal identity configuration

```powershell
pwsh ./scripts/setup-entra-portal.ps1 `
    -Apply `
    -ConfigureRoleGroups `
    -GrantGraphApplicationConsent `
    -ConfigureGitHubVariables
```

The script:

1. refuses to run against the wrong tenant;
2. resolves the existing application by its app/client ID;
3. configures SPA authorization-code flow with PKCE and disables implicit grant;
4. sets the Application ID URI and `access_as_user` delegated scope;
5. defines `Portal.Student`, `Portal.Instructor`, `Portal.Staff`, `Portal.Admin`, and `Portal.Automation`;
6. configures Microsoft Graph `User.Read` delegated and `Sites.Selected` application permissions;
7. enables the Enterprise Application and requires role assignment;
8. creates the four security groups expected by `add-portal-group-member.ps1`;
9. assigns each group to its matching app role;
10. updates the non-secret GitHub Actions identity variables.

It deliberately does not create or print a client secret.

## 4. Grant the app access to the InstructorPortal SharePoint site

`Sites.Selected` admin consent alone grants access to no sites. A SharePoint or Global Administrator must grant this app `write` access to `/sites/InstructorPortal`.

First resolve the site:

```powershell
$TenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5"
$PortalAppId = "e22672ae-61a6-434e-b135-3360557819ec"
$Site = az rest `
    --method GET `
    --url "https://graph.microsoft.com/v1.0/sites/skunkworksacademy.sharepoint.com:/sites/InstructorPortal" `
    --output json | ConvertFrom-Json

$Permission = @{
    roles = @("write")
    grantedTo = @{
        application = @{
            id = $PortalAppId
            displayName = "Skunkworks Academy Portal"
        }
    }
} | ConvertTo-Json -Depth 10

$TemporaryFile = Join-Path $env:TEMP "skw-portal-site-permission.json"
[System.IO.File]::WriteAllText($TemporaryFile, $Permission, [System.Text.UTF8Encoding]::new($false))

az rest `
    --method POST `
    --url "https://graph.microsoft.com/v1.0/sites/$($Site.id)/permissions" `
    --headers "Content-Type=application/json" `
    --body "@$TemporaryFile"

Remove-Item $TemporaryFile -Force
```

Verify the grant:

```powershell
az rest `
    --method GET `
    --url "https://graph.microsoft.com/v1.0/sites/$($Site.id)/permissions" `
    --output table
```

## 5. Backend credential

The React SPA must never receive a client secret. The current Azure Functions backend uses a confidential credential for Microsoft Graph application access, so store that credential only in Azure Function App settings or preferably Azure Key Vault.

Never create a `VITE_*` secret and never commit a secret to GitHub.

## 6. Assign an administrator and verify role claims

```powershell
pwsh ./scripts/add-portal-group-member.ps1 `
    -UserPrincipalName "raydo@skunkworks.africa" `
    -Role Admin
```

Sign out completely and sign in again so Entra issues a new token. Verify the ID/access token contains the expected `roles` claim and that:

- Student can access learner routes but receives `403` from staff routes;
- Instructor can access instructor routes;
- Staff/Admin can access `/api/staff/*`;
- an unassigned user cannot sign in when assignment is required.

## Important public-registration boundary

This workforce-tenant Enterprise Application is suitable for controlled workforce, guest, and assigned learner access. It is not a complete consumer self-service identity system. Public learner sign-up, local social identities, lifecycle policies, and automatic entitlement assignment should be implemented with Microsoft Entra External ID and a server-side provisioning workflow.

Do not automatically assign Microsoft Education licences to arbitrary anonymous users. Eligibility, tenant availability, licensing terms, and fraud controls must be verified before entitlement.

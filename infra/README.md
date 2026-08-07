# Skunkworks Academy Portal — Azure, Entra and GitHub bootstrap

This directory contains an auditable, repeatable bootstrap for the Portal enterprise application.

## Target architecture

- Microsoft Entra app registration and enterprise application
- SPA authentication for `https://portal.skunkworksacademy.com`
- Portal API scope: `access_as_user`
- Application roles:
  - `Portal.Student`
  - `Portal.Instructor`
  - `Portal.Staff`
  - `Portal.Admin`
- Security groups mapped to the application roles
- GitHub Actions deployment using OpenID Connect (OIDC), with no long-lived Azure client secret
- Azure resource deployment through Bicep

## Mobile-first execution path

You do not need to run anything immediately. Review and merge the pull request first. When you are at a computer, use Azure Cloud Shell or PowerShell 7.

### Prerequisites

- Entra role: Application Administrator or Global Administrator
- Azure role: Owner or User Access Administrator on the target subscription
- PowerShell 7
- Microsoft Graph PowerShell SDK
- Azure CLI

### Bootstrap Entra

```powershell
pwsh ./infra/entra/bootstrap-portal-entra.ps1 `
  -TenantId "338a8916-80d9-467c-a94a-7f61d04ef7d5" `
  -PortalUrl "https://portal.skunkworksacademy.com" `
  -ApiUrl "https://skunkworks-academy-portal-api-za.azurewebsites.net"
```

The script is idempotent where practical. It prints the application/client ID, object IDs, API scope and group IDs needed by the portal configuration.

### Deploy Azure resources

```bash
az login --tenant 338a8916-80d9-467c-a94a-7f61d04ef7d5
az account set --subscription "<subscription-id-or-name>"
az deployment sub create \
  --location southafricanorth \
  --template-file infra/azure/main.bicep \
  --parameters environmentName=prod
```

### GitHub OIDC

The included workflow expects these GitHub repository variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

No `AZURE_CLIENT_SECRET` should be created or stored.

## Security controls

- Use least privilege for Graph and Azure RBAC.
- Require admin consent only for permissions actually used.
- Keep production and non-production app registrations separate.
- Restrict redirect URIs to approved HTTPS origins.
- Use group-to-app-role assignment rather than direct user assignment for operational roles.
- Enable Conditional Access and phishing-resistant MFA for administrators.
- Store runtime secrets in Azure Key Vault and access them through managed identity.
- Do not commit tenant secrets, certificates, access tokens or exported app manifests containing credentials.

## Validation

After provisioning, verify:

1. The enterprise application exists and user assignment is enabled.
2. All four app roles are visible under Users and groups.
3. Each security group is assigned to the correct role.
4. The SPA redirect URI exactly matches the portal callback route.
5. Access tokens contain the expected `aud`, `scp` and/or `roles` claims.
6. GitHub Actions authenticates with OIDC and does not use a client secret.
7. The Portal API health endpoint is reachable before enabling production traffic.

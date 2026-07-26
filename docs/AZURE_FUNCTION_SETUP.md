# Azure Function App setup

This repository provisions and deploys the Skunkworks Academy Portal API through `.github/workflows/deploy-azure-function.yml`.

## Azure resources

The Bicep templates create:

- Resource group: `rg-skunkworks-academy-portal-prod`
- Linux Azure Function App on Consumption
- Storage account
- Application Insights
- Log Analytics workspace
- System-assigned managed identity
- CORS for `https://portal.skunkworksacademy.com` and `http://localhost:5173`
- Portal Entra tenant and application settings

## Current production identifiers

| Setting | Value |
|---|---|
| Subscription ID | `9f19b7fc-4a54-4c11-8cea-239dcf3392a4` |
| Tenant ID | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| Application/client ID | `e22672ae-61a6-434e-b135-3360557819ec` |
| Resource group | `rg-skunkworks-academy-portal-prod` |
| Function App resource name | `skunkworks-academy-portal-api-za` |
| Storage account | `stskunkportal12345` |
| Region | `southafricanorth` |

The Function App resource name is not necessarily its public hostname. Azure secure unique default hostnames use the format:

```text
<app-name>-<hash>.<region>.azurewebsites.net
```

Never construct `<app-name>.azurewebsites.net`. Resolve `defaultHostName` from Azure or use the Bicep `apiBaseUrl` output.

## One-time OIDC bootstrap

The deployment uses GitHub OpenID Connect. The Entra application must trust the GitHub `production` environment before `azure/login` can authenticate.

Run the idempotent bootstrap script from an administrator workstation:

```powershell
pwsh ./scripts/bootstrap-azure-oidc.ps1
```

The signed-in Azure account must be able to:

- manage federated credentials on the Entra application;
- create or read its service principal;
- assign Azure RBAC roles at the target subscription;
- administer Actions variables and environments in `skunkworks-academy/portal`.

The script performs these operations:

1. Authenticates to tenant `338a8916-80d9-467c-a94a-7f61d04ef7d5`.
2. Selects subscription `9f19b7fc-4a54-4c11-8cea-239dcf3392a4`.
3. Creates or updates the federated identity credential on application `e22672ae-61a6-434e-b135-3360557819ec`.
4. Ensures the application service principal exists.
5. Ensures the service principal has the `Contributor` role at subscription scope.
6. Creates or confirms the GitHub `production` environment.
7. Creates or updates all required GitHub Actions variables.
8. Sets `VITE_API_BASE_URL` only when Azure returns an existing Function App `defaultHostName`.

The required federated credential is:

- Issuer: `https://token.actions.githubusercontent.com`
- Subject: `repo:skunkworks-academy/portal:environment:production`
- Audience: `api://AzureADTokenExchange`
- Credential name: `github-portal-production`

To configure only Azure and skip GitHub variables:

```powershell
pwsh ./scripts/bootstrap-azure-oidc.ps1 -SkipGitHubVariables
```

## Required GitHub Actions variables

Create these under **Repository settings → Secrets and variables → Actions → Variables**. The bootstrap script creates or updates them automatically unless `-SkipGitHubVariables` is used.

| Variable | Value |
|---|---|
| `AZURE_SUBSCRIPTION_ID` | `9f19b7fc-4a54-4c11-8cea-239dcf3392a4` |
| `AZURE_TENANT_ID` | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| `AZURE_CLIENT_ID` | `e22672ae-61a6-434e-b135-3360557819ec` |
| `AZURE_RESOURCE_GROUP_NAME` | `rg-skunkworks-academy-portal-prod` |
| `AZURE_FUNCTIONAPP_NAME` | `skunkworks-academy-portal-api-za` |
| `AZURE_STORAGE_ACCOUNT_NAME` | `stskunkportal12345` |
| `AZURE_LOCATION` | `southafricanorth` |
| `PORTAL_ENTRA_TENANT_ID` | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| `PORTAL_ENTRA_CLIENT_ID` | `e22672ae-61a6-434e-b135-3360557819ec` |
| `PORTAL_APPLICATION_ID_URI` | `api://e22672ae-61a6-434e-b135-3360557819ec` |
| `PORTAL_API_SCOPE` | `api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user` |
| `PORTAL_ALLOWED_ORIGINS` | `https://portal.skunkworksacademy.com,http://localhost:5173` |
| `VITE_API_BASE_URL` | Optional. Use `https://<defaultHostName>/api`, discovered with `az functionapp show`; do not construct it from the resource name. |

The frontend Pages workflow and Function App deployment workflow consume the shared `PORTAL_ENTRA_*` variables. This prevents the frontend from requesting tokens for a different tenant or resource than the API accepts.

The workflow uses OpenID Connect. Do not store an Azure client secret or publish profile when OIDC is configured.

## Deployment process

1. Confirm the OIDC bootstrap script completed successfully.
2. Open **Actions → Deploy Azure Function → Run workflow**.
3. Leave the inputs empty to use the repository variables, or enter replacement globally unique Function App and storage names.
4. Run the workflow.
5. The workflow reads `properties.defaultHostName` and the Bicep `apiBaseUrl` output.
6. It tests `/api/health` and the browser CORS preflight on the discovered hostname.
7. It dispatches the Pages workflow with the discovered API base URL.

The workflow:

- validates tests, TypeScript and Bicep;
- signs in with the GitHub environment OIDC token;
- provisions the Azure resources;
- reads the Azure-assigned secure unique default hostname;
- builds a deployment ZIP;
- deploys the ZIP through the authenticated Azure CLI session;
- restarts the Function App;
- validates application settings, health and CORS;
- redeploys the frontend with the verified endpoint.

## Resolve the active API endpoint manually

```powershell
$ResourceGroup = "rg-skunkworks-academy-portal-prod"
$FunctionApp = "skunkworks-academy-portal-api-za"

$DefaultHostname = az functionapp show `
    --resource-group $ResourceGroup `
    --name $FunctionApp `
    --query defaultHostName `
    --output tsv

$ApiBaseUrl = "https://$DefaultHostname/api"
$ApiBaseUrl
Invoke-RestMethod "$ApiBaseUrl/health"
```

To update the repository variable manually:

```powershell
gh variable set VITE_API_BASE_URL `
    --repo skunkworks-academy/portal `
    --body $ApiBaseUrl

gh workflow run pages.yml `
    --repo skunkworks-academy/portal `
    --ref main `
    -f api_base_url=$ApiBaseUrl
```

## Troubleshooting

### Portal reports `Load failed` for an API request

This normally means the browser received no HTTP response because the hostname could not resolve, TLS failed, or CORS blocked the response. Confirm the frontend uses Azure's actual `defaultHostName`, not `<FunctionAppName>.azurewebsites.net`.

Then check:

```powershell
Invoke-RestMethod "$ApiBaseUrl/health"
```

The health response must contain `ok: true`. The Pages and Function deployment workflows now also validate CORS for `https://portal.skunkworksacademy.com`.

### `/api/admin/applications` returns an HTTP 500 after connectivity is restored

The admin applications route reads SharePoint through Microsoft Graph using application credentials. Confirm the Function App has:

```text
API_CLIENT_SECRET=<valid secret for the Portal Entra application>
GRAPH_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5
SHAREPOINT_HOSTNAME=skunkworksacademy.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/InstructorPortal
```

The Entra application must also have suitable Microsoft Graph application access to the target SharePoint site, such as a correctly granted `Sites.Selected` configuration or the broader `Sites.ReadWrite.All` application permission with admin consent.

### `AADSTS70025: has no configured federated identity credentials`

The Entra application does not yet trust the GitHub OIDC subject. Run:

```powershell
pwsh ./scripts/bootstrap-azure-oidc.ps1
```

Then rerun the failed deployment workflow.

### `No credentials found. Add an Azure login action before this action`

The prior deployment action did not receive an authenticated Azure context, usually because `azure/login` failed first. The workflow deploys the ZIP through `az functionapp deployment source config-zip` after a successful OIDC login, removing the secondary action-authentication failure.

### Role assignment fails

The signed-in administrator needs permission to assign Azure roles. Use an account with `Owner` or `User Access Administrator` at the subscription, then rerun the bootstrap script.

### Federated credential creation fails

The signed-in administrator needs permission to modify the application registration, such as ownership of the app or an appropriate Entra application-administration role.

## Entra values deployed to the Function App

The Function App receives:

- `ENTRA_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5`
- `API_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec`
- `SPA_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec`
- `APPLICATION_ID_URI=api://e22672ae-61a6-434e-b135-3360557819ec`
- `API_SCOPE=api://e22672ae-61a6-434e-b135-3360557819ec/access_as_user`
- `GRAPH_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5`

The Pages build receives matching values for `VITE_MSAL_CLIENT_ID`, `VITE_API_CLIENT_ID`, `VITE_APPLICATION_ID_URI`, `VITE_MSAL_AUTHORITY`, `VITE_API_SCOPE`, and `VITE_SKUNKWORKS_TENANT_ID`.

`API_CLIENT_SECRET` is intentionally not provisioned by Bicep. Add it only to Azure Function App settings or Key Vault if the backend needs application-only Microsoft Graph operations. Never expose it through a `VITE_*` variable.

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

## Required GitHub Actions variables

Create these under **Repository settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|---|---|
| `AZURE_SUBSCRIPTION_ID` | The subscription ID returned by `az account show --query id -o tsv` |
| `AZURE_TENANT_ID` | `338a8916-80d9-467c-a94a-7f61d04ef7d5` |
| `AZURE_CLIENT_ID` | Client ID of the GitHub deployment app/service principal with federated credentials |
| `AZURE_RESOURCE_GROUP_NAME` | `rg-skunkworks-academy-portal-prod` |
| `AZURE_FUNCTIONAPP_NAME` | A globally unique app name, for example `skunkworks-academy-portal-api-za` |
| `AZURE_STORAGE_ACCOUNT_NAME` | A globally unique lowercase storage name, 3–24 characters |
| `AZURE_LOCATION` | `southafricanorth` |

The workflow uses OpenID Connect. Do not store an Azure client secret or publish profile when OIDC is configured.

## GitHub deployment application

Create or reuse an Entra application for GitHub Actions. Add a federated credential with:

- Issuer: `https://token.actions.githubusercontent.com`
- Subject for the production environment: `repo:skunkworks-academy/portal:environment:production`
- Audience: `api://AzureADTokenExchange`

Assign the deployment service principal **Contributor** on the target subscription or resource group. If role assignment is restricted, use the smallest custom role that can deploy the resources in `infra/` and publish code to the Function App.

## Trigger deployment

1. Merge the infrastructure pull request.
2. Open **Actions → Deploy Azure Function → Run workflow**.
3. Enter globally unique Function App and storage names.
4. Run the workflow.
5. Confirm the final health step succeeds at:

   `https://<function-app-name>.azurewebsites.net/api/health`

## Frontend API URL

Set the repository variable or secret used by the frontend build:

`VITE_API_BASE_URL=https://<function-app-name>.azurewebsites.net/api`

Redeploy the portal frontend after changing this value.

## Entra values deployed to the Function App

- `ENTRA_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5`
- `API_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec`
- `SPA_CLIENT_ID=e22672ae-61a6-434e-b135-3360557819ec`
- `GRAPH_TENANT_ID=338a8916-80d9-467c-a94a-7f61d04ef7d5`

`API_CLIENT_SECRET` is intentionally not provisioned by Bicep. Add it only to Azure Function App settings or Key Vault if the backend needs application-only Microsoft Graph operations. Never expose it through a `VITE_*` variable.

[CmdletBinding()]
param(
    [string]$SubscriptionId = "9f19b7fc-4a54-4c11-8cea-239dcf3392a4",
    [string]$TenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5",
    [string]$ApplicationId = "e22672ae-61a6-434e-b135-3360557819ec",
    [string]$GitHubOrganization = "skunkworks-academy",
    [string]$GitHubRepository = "portal",
    [string]$GitHubEnvironment = "production",
    [string]$FederatedCredentialName = "github-portal-production",
    [string]$ResourceGroupName = "rg-skunkworks-academy-portal-prod",
    [string]$FunctionAppName = "skunkworks-academy-portal-api-za",
    [string]$StorageAccountName = "stskunkportal12345",
    [string]$Location = "southafricanorth",
    [switch]$SkipGitHubVariables
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-AzJson {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $raw = & az @Arguments --only-show-errors --output json
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: az $($Arguments -join ' ')"
    }
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return $raw | ConvertFrom-Json
}

Require-Command -Name "az"

Write-Host "Signing in to tenant $TenantId..." -ForegroundColor Cyan
& az login --tenant $TenantId --only-show-errors | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Azure sign-in failed." }

& az account set --subscription $SubscriptionId
if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription $SubscriptionId." }

$account = Invoke-AzJson -Arguments @("account", "show")
if ($account.id -ne $SubscriptionId) {
    throw "Azure CLI selected subscription '$($account.id)' instead of '$SubscriptionId'."
}
if ($account.tenantId -ne $TenantId) {
    throw "Azure CLI selected tenant '$($account.tenantId)' instead of '$TenantId'."
}

Write-Host "Validating Entra application $ApplicationId..." -ForegroundColor Cyan
$app = Invoke-AzJson -Arguments @("ad", "app", "show", "--id", $ApplicationId)
if (-not $app) { throw "Microsoft Entra application $ApplicationId was not found." }

$servicePrincipal = $null
try {
    $servicePrincipal = Invoke-AzJson -Arguments @("ad", "sp", "show", "--id", $ApplicationId)
}
catch {
    Write-Host "Creating service principal for the application..." -ForegroundColor Yellow
    $servicePrincipal = Invoke-AzJson -Arguments @("ad", "sp", "create", "--id", $ApplicationId)
}

$issuer = "https://token.actions.githubusercontent.com"
$subject = "repo:$GitHubOrganization/$GitHubRepository:environment:$GitHubEnvironment"
$audience = "api://AzureADTokenExchange"

$credential = [ordered]@{
    name = $FederatedCredentialName
    issuer = $issuer
    subject = $subject
    description = "GitHub Actions OIDC for $GitHubOrganization/$GitHubRepository environment $GitHubEnvironment"
    audiences = @($audience)
}

$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) "github-federated-credential-$([guid]::NewGuid().ToString('N')).json"
try {
    $json = $credential | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($tempFile, $json, [System.Text.UTF8Encoding]::new($false))

    $credentials = Invoke-AzJson -Arguments @("ad", "app", "federated-credential", "list", "--id", $ApplicationId)
    $existing = @($credentials) | Where-Object { $_.name -eq $FederatedCredentialName } | Select-Object -First 1

    if ($existing) {
        $existingAudience = @($existing.audiences)
        $matches = $existing.issuer.TrimEnd('/') -eq $issuer.TrimEnd('/') -and
                   $existing.subject -eq $subject -and
                   $existingAudience -contains $audience

        if ($matches) {
            Write-Host "Federated identity credential already matches the GitHub production environment." -ForegroundColor Green
        }
        else {
            Write-Host "Updating the existing federated identity credential..." -ForegroundColor Yellow
            & az ad app federated-credential update `
                --id $ApplicationId `
                --federated-credential-id $existing.id `
                --parameters $tempFile `
                --only-show-errors | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to update federated identity credential." }
        }
    }
    else {
        Write-Host "Creating the federated identity credential..." -ForegroundColor Cyan
        & az ad app federated-credential create `
            --id $ApplicationId `
            --parameters $tempFile `
            --only-show-errors | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to create federated identity credential." }
    }
}
finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}

$scope = "/subscriptions/$SubscriptionId"
Write-Host "Checking Contributor role assignment at $scope..." -ForegroundColor Cyan
$assignmentId = & az role assignment list `
    --assignee-object-id $servicePrincipal.id `
    --scope $scope `
    --role "Contributor" `
    --query "[0].id" `
    --output tsv `
    --only-show-errors

if ($LASTEXITCODE -ne 0) { throw "Unable to inspect Azure role assignments." }

if ([string]::IsNullOrWhiteSpace($assignmentId)) {
    Write-Host "Assigning Contributor to the deployment service principal..." -ForegroundColor Yellow
    & az role assignment create `
        --assignee-object-id $servicePrincipal.id `
        --assignee-principal-type ServicePrincipal `
        --role "Contributor" `
        --scope $scope `
        --only-show-errors | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to assign Contributor at subscription scope." }
}
else {
    Write-Host "Contributor role assignment already exists." -ForegroundColor Green
}

if (-not $SkipGitHubVariables) {
    Require-Command -Name "gh"
    & gh auth status
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI is not authenticated." }

    $repository = "$GitHubOrganization/$GitHubRepository"
    Write-Host "Creating or confirming GitHub environment '$GitHubEnvironment'..." -ForegroundColor Cyan
    & gh api --method PUT "repos/$repository/environments/$GitHubEnvironment" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create or confirm the GitHub environment." }

    $variables = [ordered]@{
        AZURE_SUBSCRIPTION_ID = $SubscriptionId
        AZURE_TENANT_ID = $TenantId
        AZURE_CLIENT_ID = $ApplicationId
        AZURE_RESOURCE_GROUP_NAME = $ResourceGroupName
        AZURE_FUNCTIONAPP_NAME = $FunctionAppName
        AZURE_STORAGE_ACCOUNT_NAME = $StorageAccountName
        AZURE_LOCATION = $Location
        PORTAL_ENTRA_TENANT_ID = $TenantId
        PORTAL_ENTRA_CLIENT_ID = $ApplicationId
        PORTAL_APPLICATION_ID_URI = "api://$ApplicationId"
        PORTAL_API_SCOPE = "api://$ApplicationId/access_as_user"
        PORTAL_ALLOWED_ORIGINS = "https://portal.skunkworksacademy.com,http://localhost:5173"
        PORTAL_API_BASE_URL = "https://api.skunkworksacademy.com/api"
        VITE_API_BASE_URL = "https://api.skunkworksacademy.com/api"
    }

    foreach ($entry in $variables.GetEnumerator()) {
        Write-Host "Setting GitHub Actions variable $($entry.Key)..."
        & gh variable set $entry.Key --repo $repository --body ([string]$entry.Value)
        if ($LASTEXITCODE -ne 0) { throw "Failed to set GitHub variable $($entry.Key)." }
    }

    Write-Host "Configured GitHub Actions variables:" -ForegroundColor Green
    & gh variable list --repo $repository
}

Write-Host "" 
Write-Host "Azure OIDC bootstrap completed." -ForegroundColor Green
Write-Host "Issuer:  $issuer"
Write-Host "Subject: $subject"
Write-Host "Audience: $audience"
Write-Host "Next: run the 'Deploy Azure Function' workflow in $GitHubOrganization/$GitHubRepository."

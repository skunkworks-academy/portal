<#
.SYNOPSIS
Validates the deployed Skunkworks Academy Portal Azure Function endpoint, health, CORS, and required settings.

.DESCRIPTION
The script discovers Azure's actual Function App default hostname. It never constructs
<FunctionAppName>.azurewebsites.net because secure unique default hostnames can include a hash and region.
It reports configuration presence without printing secret values.

.EXAMPLE
.\scripts\test-portal-api.ps1

.EXAMPLE
.\scripts\test-portal-api.ps1 -FailOnMissingAdminSettings
#>

[CmdletBinding()]
param(
    [string]$SubscriptionId = "9f19b7fc-4a54-4c11-8cea-239dcf3392a4",
    [string]$ResourceGroupName = "rg-skunkworks-academy-portal-prod",
    [string]$FunctionAppName = "skunkworks-academy-portal-api-za",
    [string]$ExpectedOrigin = "https://portal.skunkworksacademy.com",
    [switch]$FailOnMissingAdminSettings
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Check {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [bool]$Passed,
        [Parameter(Mandatory)] [string]$Detail
    )

    $Status = if ($Passed) { "PASS" } else { "FAIL" }
    $Colour = if ($Passed) { "Green" } else { "Red" }
    Write-Host "[$Status] $Name - $Detail" -ForegroundColor $Colour
}

function Require-Command {
    param([Parameter(Mandatory)] [string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

Require-Command -Name "az"

$Failures = [System.Collections.Generic.List[string]]::new()

$Account = (& az account show --only-show-errors --output json) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $Account) {
    throw "Azure CLI is not authenticated. Run az login first."
}

if ($Account.id -ne $SubscriptionId) {
    & az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to select subscription $SubscriptionId."
    }
    $Account = (& az account show --only-show-errors --output json) | ConvertFrom-Json
}

Write-Check -Name "Azure subscription" -Passed ($Account.id -eq $SubscriptionId) -Detail ([string]$Account.id)

$FunctionApp = (& az functionapp show `
    --resource-group $ResourceGroupName `
    --name $FunctionAppName `
    --only-show-errors `
    --output json) | ConvertFrom-Json

if ($LASTEXITCODE -ne 0 -or -not $FunctionApp) {
    throw "Function App '$FunctionAppName' was not found in resource group '$ResourceGroupName'."
}

$DefaultHostname = [string]$FunctionApp.defaultHostName
$ApiBaseUrl = "https://$DefaultHostname/api"
$HealthUrl = "$ApiBaseUrl/health"
$AdminUrl = "$ApiBaseUrl/admin/applications"

$HostnameValid = -not [string]::IsNullOrWhiteSpace($DefaultHostname)
Write-Check -Name "Function state" -Passed ($FunctionApp.state -eq "Running") -Detail ([string]$FunctionApp.state)
Write-Check -Name "Azure default hostname" -Passed $HostnameValid -Detail $DefaultHostname

if (-not $HostnameValid) {
    $Failures.Add("Azure did not return defaultHostName.")
}

if ($DefaultHostname -eq "$FunctionAppName.azurewebsites.net") {
    Write-Host "[INFO] This Function App uses the original default-hostname format." -ForegroundColor DarkCyan
}
else {
    Write-Host "[INFO] This Function App uses Azure's secure unique default-hostname format." -ForegroundColor DarkCyan
}

Write-Host "API base URL: $ApiBaseUrl" -ForegroundColor Cyan

try {
    $HealthResponse = Invoke-WebRequest `
        -Uri $HealthUrl `
        -Method Get `
        -Headers @{ Origin = $ExpectedOrigin } `
        -TimeoutSec 30 `
        -UseBasicParsing

    $Health = $HealthResponse.Content | ConvertFrom-Json
    $HealthPassed = $HealthResponse.StatusCode -eq 200 -and $Health.ok -eq $true
    Write-Check -Name "API health" -Passed $HealthPassed -Detail "HTTP $($HealthResponse.StatusCode); ok=$($Health.ok)"

    if (-not $HealthPassed) {
        $Failures.Add("The health endpoint did not return HTTP 200 with ok=true.")
    }

    $HealthCorsOrigin = [string]$HealthResponse.Headers["Access-Control-Allow-Origin"]
    $HealthCorsPassed = $HealthCorsOrigin -eq $ExpectedOrigin
    Write-Check -Name "Health CORS" -Passed $HealthCorsPassed -Detail $HealthCorsOrigin
    if (-not $HealthCorsPassed) {
        $Failures.Add("The health endpoint did not return the expected Access-Control-Allow-Origin header.")
    }

    $MissingHealthSettings = @($Health.missingSettings)
    if ($MissingHealthSettings.Count -eq 0) {
        Write-Check -Name "Health configuration" -Passed $true -Detail "No missing settings reported"
    }
    else {
        Write-Check -Name "Health configuration" -Passed $false -Detail ($MissingHealthSettings -join ", ")
        if ($FailOnMissingAdminSettings) {
            $Failures.Add("Health reported missing settings: $($MissingHealthSettings -join ', ').")
        }
    }
}
catch {
    Write-Check -Name "API health" -Passed $false -Detail $_.Exception.Message
    $Failures.Add("The health endpoint could not be reached.")
}

try {
    $PreflightResponse = Invoke-WebRequest `
        -Uri $AdminUrl `
        -Method Options `
        -Headers @{
            Origin = $ExpectedOrigin
            "Access-Control-Request-Method" = "GET"
            "Access-Control-Request-Headers" = "authorization"
        } `
        -TimeoutSec 30 `
        -UseBasicParsing

    $PreflightOrigin = [string]$PreflightResponse.Headers["Access-Control-Allow-Origin"]
    $PreflightPassed = $PreflightResponse.StatusCode -in @(200, 204) -and $PreflightOrigin -eq $ExpectedOrigin
    Write-Check -Name "Admin route CORS preflight" -Passed $PreflightPassed -Detail "HTTP $($PreflightResponse.StatusCode); origin=$PreflightOrigin"

    if (-not $PreflightPassed) {
        $Failures.Add("The admin applications CORS preflight failed.")
    }
}
catch {
    Write-Check -Name "Admin route CORS preflight" -Passed $false -Detail $_.Exception.Message
    $Failures.Add("The admin applications CORS preflight could not be completed.")
}

$Settings = @(
    (& az functionapp config appsettings list `
        --resource-group $ResourceGroupName `
        --name $FunctionAppName `
        --only-show-errors `
        --output json) | ConvertFrom-Json
)

if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Function App settings."
}

$RequiredSettings = @(
    "ENTRA_TENANT_ID",
    "API_CLIENT_ID",
    "SPA_CLIENT_ID",
    "APPLICATION_ID_URI",
    "API_SCOPE",
    "GRAPH_TENANT_ID",
    "SHAREPOINT_HOSTNAME",
    "SHAREPOINT_SITE_PATH",
    "ALLOWED_ORIGINS"
)

$AdminSettings = @(
    "API_CLIENT_SECRET"
)

foreach ($SettingName in $RequiredSettings) {
    $Setting = $Settings | Where-Object { $_.name -eq $SettingName } | Select-Object -First 1
    $Present = $null -ne $Setting -and -not [string]::IsNullOrWhiteSpace([string]$Setting.value)
    Write-Check -Name "Function setting $SettingName" -Passed $Present -Detail $(if ($Present) { "Present" } else { "Missing" })
    if (-not $Present) {
        $Failures.Add("Function setting $SettingName is missing.")
    }
}

foreach ($SettingName in $AdminSettings) {
    $Setting = $Settings | Where-Object { $_.name -eq $SettingName } | Select-Object -First 1
    $Present = $null -ne $Setting -and -not [string]::IsNullOrWhiteSpace([string]$Setting.value)
    Write-Check -Name "Admin setting $SettingName" -Passed $Present -Detail $(if ($Present) { "Present; value not displayed" } else { "Missing" })
    if ($FailOnMissingAdminSettings -and -not $Present) {
        $Failures.Add("Admin setting $SettingName is missing.")
    }
}

$Cors = (& az functionapp cors show `
    --resource-group $ResourceGroupName `
    --name $FunctionAppName `
    --only-show-errors `
    --output json) | ConvertFrom-Json

$AllowedOrigins = @($Cors.allowedOrigins)
$PlatformCorsPassed = $AllowedOrigins -contains $ExpectedOrigin
Write-Check -Name "Azure platform CORS" -Passed $PlatformCorsPassed -Detail ($AllowedOrigins -join ", ")
if (-not $PlatformCorsPassed) {
    $Failures.Add("Azure platform CORS does not include $ExpectedOrigin.")
}

Write-Host ""
if ($Failures.Count -gt 0) {
    Write-Host "Portal API validation found $($Failures.Count) issue(s):" -ForegroundColor Red
    $Failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "Portal API endpoint, health, CORS, and required settings passed validation." -ForegroundColor Green

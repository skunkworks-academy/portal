<#
.SYNOPSIS
Plans or applies the Microsoft Entra configuration for the Skunkworks Academy Portal.

.DESCRIPTION
The default execution is read-only. Add -Apply to reconcile the existing app registration,
enterprise application, SPA redirects, delegated API scope, app roles, Microsoft Graph
permissions, optional role groups, and optional GitHub Actions variables.

The script deliberately does not create or print a client secret.

.EXAMPLE
pwsh ./scripts/setup-entra-portal.ps1

.EXAMPLE
pwsh ./scripts/setup-entra-portal.ps1 -Apply -ConfigureRoleGroups -GrantGraphApplicationConsent -ConfigureGitHubVariables

.EXAMPLE
pwsh ./scripts/setup-entra-portal.ps1 -Apply -UserAssignmentRequired:$false
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [ValidatePattern("^[0-9a-fA-F-]{36}$")]
    [string]$TenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5",

    [ValidatePattern("^[0-9a-fA-F-]{36}$")]
    [string]$ApplicationId = "e22672ae-61a6-434e-b135-3360557819ec",

    [ValidateNotNullOrEmpty()]
    [string]$ApplicationDisplayName = "Skunkworks Academy Portal",

    [ValidateSet("AzureADMyOrg", "AzureADMultipleOrgs", "AzureADandPersonalMicrosoftAccount")]
    [string]$SignInAudience = "AzureADandPersonalMicrosoftAccount",

    [string[]]$SpaRedirectUris = @(
        "https://portal.skunkworksacademy.com/",
        "http://localhost:5173/"
    ),

    [ValidateNotNullOrEmpty()]
    [string]$HomePageUrl = "https://portal.skunkworksacademy.com/",

    [bool]$UserAssignmentRequired = $true,

    [switch]$Apply,
    [switch]$ConfigureRoleGroups,
    [switch]$GrantGraphApplicationConsent,
    [switch]$ConfigureGitHubVariables,
    [switch]$UseDeviceCode,

    [ValidateNotNullOrEmpty()]
    [string]$GitHubRepository = "skunkworks-academy/portal",

    [ValidateNotNullOrEmpty()]
    [string]$ReportPath = "./artifacts/entra-portal-inventory.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$GraphRoot = "https://graph.microsoft.com/v1.0"
$MicrosoftGraphApplicationId = "00000003-0000-0000-c000-000000000000"
$ApplicationIdUri = "api://$ApplicationId"
$DelegatedScopeValue = "access_as_user"

$PortalRoles = @(
    [ordered]@{
        value = "Portal.Student"
        displayName = "Portal Student"
        description = "Student access for class registration, course discovery, profile management, and learner resources."
        allowedMemberTypes = @("User")
    },
    [ordered]@{
        value = "Portal.Instructor"
        displayName = "Portal Instructor"
        description = "Instructor access for applications, profiles, documents, and assigned classes."
        allowedMemberTypes = @("User")
    },
    [ordered]@{
        value = "Portal.Staff"
        displayName = "Portal Staff"
        description = "Staff operations access for delivery, scheduling, monitoring, and learner support."
        allowedMemberTypes = @("User")
    },
    [ordered]@{
        value = "Portal.Admin"
        displayName = "Portal Admin"
        description = "Full administrator access for Skunkworks Academy Portal operations."
        allowedMemberTypes = @("User")
    },
    [ordered]@{
        value = "Portal.Automation"
        displayName = "Portal Automation"
        description = "Application access for trusted portal automation."
        allowedMemberTypes = @("Application")
    }
)

$RoleGroups = @(
    [ordered]@{ displayName = "Skunkworks Academy Portal - Learners"; mailNickname = "skw-portal-learners"; role = "Portal.Student" },
    [ordered]@{ displayName = "Skunkworks Academy Portal - Instructors"; mailNickname = "skw-portal-instructors"; role = "Portal.Instructor" },
    [ordered]@{ displayName = "Skunkworks Academy Portal - Operations"; mailNickname = "skw-portal-operations"; role = "Portal.Staff" },
    [ordered]@{ displayName = "Skunkworks Academy Portal - Administrators"; mailNickname = "skw-portal-administrators"; role = "Portal.Admin" }
)

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found. Install it, reopen PowerShell, and rerun the script."
    }
}

function Invoke-AzJson {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowEmpty
    )

    $Output = & az @Arguments --only-show-errors --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI failed: az $($Arguments -join ' ')`n$($Output -join [Environment]::NewLine)"
    }

    $Text = ($Output -join [Environment]::NewLine).Trim()
    if ([string]::IsNullOrWhiteSpace($Text)) {
        if ($AllowEmpty) { return $null }
        throw "Azure CLI returned no JSON for: az $($Arguments -join ' ')"
    }

    try {
        return $Text | ConvertFrom-Json -Depth 100
    }
    catch {
        throw "Azure CLI returned invalid JSON for: az $($Arguments -join ' ')`n$Text"
    }
}

function Invoke-Graph {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PATCH")][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [object]$Body,
        [switch]$AllowEmpty
    )

    $Arguments = @("rest", "--method", $Method, "--url", $Uri)
    $TemporaryFile = $null

    try {
        if ($PSBoundParameters.ContainsKey("Body")) {
            $TemporaryFile = Join-Path ([System.IO.Path]::GetTempPath()) "skw-entra-$([guid]::NewGuid().ToString('N')).json"
            $Json = $Body | ConvertTo-Json -Depth 100
            [System.IO.File]::WriteAllText($TemporaryFile, $Json, [System.Text.UTF8Encoding]::new($false))
            $Arguments += @("--headers", "Content-Type=application/json", "--body", "@$TemporaryFile")
        }

        return Invoke-AzJson -Arguments $Arguments -AllowEmpty:$AllowEmpty
    }
    finally {
        if ($TemporaryFile) {
            Remove-Item -LiteralPath $TemporaryFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-GraphCollection {
    param([Parameter(Mandatory = $true)][string]$Uri)

    $Items = @()
    $Next = $Uri
    while ($Next) {
        $Page = Invoke-Graph -Method GET -Uri $Next
        $Items += @($Page.value)
        $NextLinkProperty = $Page.PSObject.Properties["@odata.nextLink"]
        $Next = if ($NextLinkProperty) { [string]$NextLinkProperty.Value } else { $null }
    }
    return @($Items)
}

function Get-SingleByFilter {
    param(
        [Parameter(Mandatory = $true)][string]$Resource,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Description,
        [string[]]$Select
    )

    $EncodedFilter = [Uri]::EscapeDataString($Filter)
    $Uri = "$GraphRoot/${Resource}?`$filter=$EncodedFilter"
    if (@($Select).Count -gt 0) {
        $Uri += "&`$select=$($Select -join ',')"
    }
    $Matches = @(Get-GraphCollection -Uri $Uri)
    if ($Matches.Count -gt 1) {
        throw "More than one $Description matched '$Filter'. Resolve the duplicate objects before continuing."
    }
    return $Matches | Select-Object -First 1
}

function Connect-CorrectTenant {
    $Account = $null
    try {
        $Account = Invoke-AzJson -Arguments @("account", "show")
    }
    catch {
        $Account = $null
    }

    if (-not $Account -or $Account.tenantId -ne $TenantId) {
        Write-Host "Authenticating to tenant $TenantId..." -ForegroundColor Cyan
        $LoginArguments = @("login", "--tenant", $TenantId, "--allow-no-subscriptions")
        if ($UseDeviceCode) { $LoginArguments += "--use-device-code" }
        & az @LoginArguments --only-show-errors | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Azure sign-in did not complete."
        }
        $Account = Invoke-AzJson -Arguments @("account", "show")
    }

    if ($Account.tenantId -ne $TenantId) {
        throw "Connected tenant '$($Account.tenantId)' does not match required tenant '$TenantId'."
    }

    return $Account
}

function New-OrPreservedPermissionScope {
    param([object[]]$ExistingScopes)

    $Existing = @($ExistingScopes) | Where-Object { $_.value -eq $DelegatedScopeValue } | Select-Object -First 1
    $ScopeId = if ($Existing -and $Existing.id) { [string]$Existing.id } else { [guid]::NewGuid().Guid }

    return [ordered]@{
        id = $ScopeId
        value = $DelegatedScopeValue
        type = "User"
        isEnabled = $true
        adminConsentDisplayName = "Access Skunkworks Academy Portal API"
        adminConsentDescription = "Allow the application to access the Skunkworks Academy Portal API on behalf of the signed-in user."
        userConsentDisplayName = "Access Skunkworks Academy Portal API"
        userConsentDescription = "Allow the application to access the Skunkworks Academy Portal API on your behalf."
    }
}

function New-OrPreservedAppRoles {
    param([object[]]$ExistingRoles)

    $Result = @()
    foreach ($Desired in $PortalRoles) {
        $Existing = @($ExistingRoles) | Where-Object { $_.value -eq $Desired.value } | Select-Object -First 1
        $RoleId = if ($Existing -and $Existing.id) { [string]$Existing.id } else { [guid]::NewGuid().Guid }
        $Result += [ordered]@{
            id = $RoleId
            value = $Desired.value
            displayName = $Desired.displayName
            description = $Desired.description
            allowedMemberTypes = @($Desired.allowedMemberTypes)
            isEnabled = $true
        }
    }

    $UnmanagedEnabledRoles = @($ExistingRoles) | Where-Object {
        $_.isEnabled -and $_.value -and ($PortalRoles.value -notcontains $_.value)
    }
    return @($Result + $UnmanagedEnabledRoles)
}

function Get-GraphPermission {
    param(
        [Parameter(Mandatory = $true)][object]$GraphServicePrincipal,
        [Parameter(Mandatory = $true)][ValidateSet("Scope", "Role")][string]$Type,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $Collection = if ($Type -eq "Scope") { @($GraphServicePrincipal.oauth2PermissionScopes) } else { @($GraphServicePrincipal.appRoles) }
    $Permission = $Collection | Where-Object {
        $_.value -eq $Value -and $_.isEnabled -and ($Type -eq "Scope" -or $_.allowedMemberTypes -contains "Application")
    } | Select-Object -First 1

    if (-not $Permission) {
        throw "Microsoft Graph permission '$Value' ($Type) could not be resolved from the tenant service principal."
    }
    return $Permission
}

function Merge-RequiredResourceAccess {
    param(
        [object[]]$Existing,
        [Parameter(Mandatory = $true)][string]$UserReadScopeId,
        [Parameter(Mandatory = $true)][string]$SitesSelectedRoleId,
        [Parameter(Mandatory = $true)][string]$PortalScopeId
    )

    $ByResource = [ordered]@{}
    foreach ($Resource in @($Existing)) {
        if (-not $Resource.resourceAppId) { continue }
        $ByResource[[string]$Resource.resourceAppId] = @($Resource.resourceAccess)
    }

    $ByResource[$MicrosoftGraphApplicationId] = @(
        @($ByResource[$MicrosoftGraphApplicationId]) +
        [ordered]@{ id = $UserReadScopeId; type = "Scope" } +
        [ordered]@{ id = $SitesSelectedRoleId; type = "Role" }
    ) | Sort-Object id, type -Unique

    $ByResource[$ApplicationId] = @(
        @($ByResource[$ApplicationId]) +
        [ordered]@{ id = $PortalScopeId; type = "Scope" }
    ) | Sort-Object id, type -Unique

    $Result = @()
    foreach ($ResourceAppId in $ByResource.Keys) {
        $Result += [ordered]@{
            resourceAppId = $ResourceAppId
            resourceAccess = @($ByResource[$ResourceAppId])
        }
    }
    return @($Result)
}

function Ensure-GraphApplicationConsent {
    param(
        [Parameter(Mandatory = $true)][object]$PortalServicePrincipal,
        [Parameter(Mandatory = $true)][object]$GraphServicePrincipal,
        [Parameter(Mandatory = $true)][string]$SitesSelectedRoleId
    )

    $Assignments = @(Get-GraphCollection -Uri "$GraphRoot/servicePrincipals/$($PortalServicePrincipal.id)/appRoleAssignments")
    $Existing = $Assignments | Where-Object {
        $_.resourceId -eq $GraphServicePrincipal.id -and $_.appRoleId -eq $SitesSelectedRoleId
    } | Select-Object -First 1

    if ($Existing) {
        Write-Host "Microsoft Graph Sites.Selected application consent already exists." -ForegroundColor Green
        return
    }

    $Body = [ordered]@{
        principalId = $PortalServicePrincipal.id
        resourceId = $GraphServicePrincipal.id
        appRoleId = $SitesSelectedRoleId
    }
    Invoke-Graph -Method POST -Uri "$GraphRoot/servicePrincipals/$($PortalServicePrincipal.id)/appRoleAssignments" -Body $Body | Out-Null
    Write-Host "Granted Microsoft Graph Sites.Selected application consent." -ForegroundColor Green
}

function Ensure-RoleGroups {
    param(
        [Parameter(Mandatory = $true)][object]$PortalServicePrincipal,
        [Parameter(Mandatory = $true)][object[]]$AppRoles
    )

    foreach ($Definition in $RoleGroups) {
        $EscapedName = $Definition.displayName.Replace("'", "''")
        $Group = Get-SingleByFilter -Resource "groups" -Filter "displayName eq '$EscapedName'" -Description "group"

        if (-not $Group) {
            $GroupBody = [ordered]@{
                displayName = $Definition.displayName
                description = "Security group for $($Definition.role) access to the Skunkworks Academy Portal."
                mailEnabled = $false
                mailNickname = $Definition.mailNickname
                securityEnabled = $true
                groupTypes = @()
            }
            $Group = Invoke-Graph -Method POST -Uri "$GraphRoot/groups" -Body $GroupBody
            Write-Host "Created security group: $($Definition.displayName)" -ForegroundColor Green
        }

        if (-not $Group.securityEnabled) {
            throw "Group '$($Definition.displayName)' exists but is not security-enabled."
        }

        $Role = @($AppRoles) | Where-Object { $_.value -eq $Definition.role } | Select-Object -First 1
        if (-not $Role) {
            throw "App role '$($Definition.role)' was not found after application reconciliation."
        }

        $Assignments = @(Get-GraphCollection -Uri "$GraphRoot/groups/$($Group.id)/appRoleAssignments")
        $Existing = $Assignments | Where-Object {
            $_.resourceId -eq $PortalServicePrincipal.id -and $_.appRoleId -eq $Role.id
        } | Select-Object -First 1

        if (-not $Existing) {
            $AssignmentBody = [ordered]@{
                principalId = $Group.id
                resourceId = $PortalServicePrincipal.id
                appRoleId = $Role.id
            }
            Invoke-Graph -Method POST -Uri "$GraphRoot/groups/$($Group.id)/appRoleAssignments" -Body $AssignmentBody | Out-Null
            Write-Host "Assigned $($Definition.displayName) -> $($Definition.role)" -ForegroundColor Green
        }
        else {
            Write-Host "Role assignment already exists: $($Definition.displayName) -> $($Definition.role)" -ForegroundColor DarkGreen
        }
    }
}

function Set-GitHubVariables {
    Require-Command -Name "gh"
    & gh auth status
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI is not authenticated. Run 'gh auth login' and retry."
    }

    $Variables = [ordered]@{
        PORTAL_ENTRA_TENANT_ID = $TenantId
        PORTAL_ENTRA_CLIENT_ID = $ApplicationId
        PORTAL_APPLICATION_ID_URI = $ApplicationIdUri
        PORTAL_API_SCOPE = "$ApplicationIdUri/$DelegatedScopeValue"
    }

    foreach ($Entry in $Variables.GetEnumerator()) {
        & gh variable set $Entry.Key --repo $GitHubRepository --body ([string]$Entry.Value)
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to set GitHub Actions variable '$($Entry.Key)'."
        }
    }
}

Require-Command -Name "az"
$Account = Connect-CorrectTenant

$Application = Get-SingleByFilter `
    -Resource "applications" `
    -Filter "appId eq '$ApplicationId'" `
    -Description "application registration" `
    -Select @("id", "appId", "displayName", "signInAudience", "identifierUris", "spa", "web", "api", "appRoles", "requiredResourceAccess")
if (-not $Application) {
    throw "Application registration '$ApplicationId' was not found in tenant '$TenantId'. This script will not silently create a replacement with a different client ID."
}

$PortalServicePrincipal = Get-SingleByFilter `
    -Resource "servicePrincipals" `
    -Filter "appId eq '$ApplicationId'" `
    -Description "enterprise application" `
    -Select @("id", "appId", "displayName", "accountEnabled", "appRoleAssignmentRequired")
$GraphServicePrincipal = Get-SingleByFilter `
    -Resource "servicePrincipals" `
    -Filter "appId eq '$MicrosoftGraphApplicationId'" `
    -Description "Microsoft Graph service principal" `
    -Select @("id", "appId", "displayName", "oauth2PermissionScopes", "appRoles")
if (-not $GraphServicePrincipal) {
    throw "The Microsoft Graph service principal was not found in tenant '$TenantId'."
}

$UserRead = Get-GraphPermission -GraphServicePrincipal $GraphServicePrincipal -Type Scope -Value "User.Read"
$SitesSelected = Get-GraphPermission -GraphServicePrincipal $GraphServicePrincipal -Type Role -Value "Sites.Selected"
$DesiredScope = New-OrPreservedPermissionScope -ExistingScopes @($Application.api.oauth2PermissionScopes)
$DesiredRoles = New-OrPreservedAppRoles -ExistingRoles @($Application.appRoles)
$DesiredRequiredAccess = Merge-RequiredResourceAccess `
    -Existing @($Application.requiredResourceAccess) `
    -UserReadScopeId $UserRead.id `
    -SitesSelectedRoleId $SitesSelected.id `
    -PortalScopeId $DesiredScope.id

$Inventory = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString("o")
    mode = if ($Apply) { "Apply" } else { "Inventory" }
    tenant = [ordered]@{
        expectedTenantId = $TenantId
        connectedTenantId = $Account.tenantId
        subscriptionId = $Account.id
        subscriptionName = $Account.name
    }
    application = [ordered]@{
        objectId = $Application.id
        appId = $Application.appId
        displayName = $Application.displayName
        signInAudience = $Application.signInAudience
        identifierUris = @($Application.identifierUris)
        spaRedirectUris = @($Application.spa.redirectUris)
        scopeValues = @($Application.api.oauth2PermissionScopes | ForEach-Object { $_.value })
        appRoleValues = @($Application.appRoles | ForEach-Object { $_.value })
    }
    enterpriseApplication = if ($PortalServicePrincipal) {
        [ordered]@{
            objectId = $PortalServicePrincipal.id
            displayName = $PortalServicePrincipal.displayName
            accountEnabled = $PortalServicePrincipal.accountEnabled
            appRoleAssignmentRequired = $PortalServicePrincipal.appRoleAssignmentRequired
        }
    } else {
        $null
    }
    desired = [ordered]@{
        displayName = $ApplicationDisplayName
        signInAudience = $SignInAudience
        applicationIdUri = $ApplicationIdUri
        apiScope = "$ApplicationIdUri/$DelegatedScopeValue"
        spaRedirectUris = @($SpaRedirectUris | Sort-Object -Unique)
        appRoles = @($PortalRoles.value)
        graphDelegatedPermissions = @("User.Read")
        graphApplicationPermissions = @("Sites.Selected")
        userAssignmentRequired = $UserAssignmentRequired
    }
}

$ResolvedReportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
$ReportDirectory = Split-Path -Parent $ResolvedReportPath
if ($ReportDirectory -and -not (Test-Path -LiteralPath $ReportDirectory)) {
    New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
}
[System.IO.File]::WriteAllText(
    $ResolvedReportPath,
    ($Inventory | ConvertTo-Json -Depth 100),
    [System.Text.UTF8Encoding]::new($false)
)

if (-not $Apply) {
    Write-Host ""
    Write-Host "Read-only inventory completed. No tenant settings were changed." -ForegroundColor Green
    Write-Host "Report: $ResolvedReportPath"
    Write-Host "Rerun with -Apply after reviewing the report."
    $Inventory
    return
}

if (-not $PSCmdlet.ShouldProcess(
    "$ApplicationDisplayName ($ApplicationId) in tenant $TenantId",
    "Reconcile app registration and enterprise application"
)) {
    return
}

$ApplicationPatch = [ordered]@{
    displayName = $ApplicationDisplayName
    signInAudience = $SignInAudience
    identifierUris = @($ApplicationIdUri)
    spa = [ordered]@{
        redirectUris = @($SpaRedirectUris | Sort-Object -Unique)
    }
    web = [ordered]@{
        homePageUrl = $HomePageUrl
        logoutUrl = $HomePageUrl
        redirectUris = @()
        implicitGrantSettings = [ordered]@{
            enableAccessTokenIssuance = $false
            enableIdTokenIssuance = $false
        }
    }
    api = [ordered]@{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes = @($DesiredScope)
        preAuthorizedApplications = @()
    }
    appRoles = @($DesiredRoles)
    requiredResourceAccess = @($DesiredRequiredAccess)
}

Invoke-Graph -Method PATCH -Uri "$GraphRoot/applications/$($Application.id)" -Body $ApplicationPatch -AllowEmpty | Out-Null
Write-Host "Application registration reconciled." -ForegroundColor Green

if (-not $PortalServicePrincipal) {
    $PortalServicePrincipal = Invoke-Graph -Method POST -Uri "$GraphRoot/servicePrincipals" -Body ([ordered]@{ appId = $ApplicationId })
    Write-Host "Enterprise application created." -ForegroundColor Green
}

$ServicePrincipalPatch = [ordered]@{
    accountEnabled = $true
    appRoleAssignmentRequired = $UserAssignmentRequired
    homepage = $HomePageUrl
    loginUrl = $HomePageUrl
}
Invoke-Graph -Method PATCH -Uri "$GraphRoot/servicePrincipals/$($PortalServicePrincipal.id)" -Body $ServicePrincipalPatch -AllowEmpty | Out-Null
Write-Host "Enterprise application properties reconciled." -ForegroundColor Green

if ($GrantGraphApplicationConsent) {
    Ensure-GraphApplicationConsent `
        -PortalServicePrincipal $PortalServicePrincipal `
        -GraphServicePrincipal $GraphServicePrincipal `
        -SitesSelectedRoleId $SitesSelected.id
}

if ($ConfigureRoleGroups) {
    $RefreshedApplication = Invoke-Graph -Method GET -Uri "$GraphRoot/applications/$($Application.id)"
    Ensure-RoleGroups -PortalServicePrincipal $PortalServicePrincipal -AppRoles @($RefreshedApplication.appRoles)
}

if ($ConfigureGitHubVariables) {
    Set-GitHubVariables
    Write-Host "GitHub Actions identity variables reconciled." -ForegroundColor Green
}

$VerifiedApplication = Invoke-Graph -Method GET -Uri "$GraphRoot/applications/$($Application.id)"
$VerifiedServicePrincipal = Invoke-Graph -Method GET -Uri "$GraphRoot/servicePrincipals/$($PortalServicePrincipal.id)"

$Result = [ordered]@{
    status = "Applied"
    tenantId = $TenantId
    applicationId = $VerifiedApplication.appId
    applicationObjectId = $VerifiedApplication.id
    enterpriseApplicationObjectId = $VerifiedServicePrincipal.id
    applicationIdUri = @($VerifiedApplication.identifierUris) | Select-Object -First 1
    apiScope = "$ApplicationIdUri/$DelegatedScopeValue"
    spaRedirectUris = @($VerifiedApplication.spa.redirectUris)
    appRoles = @($VerifiedApplication.appRoles | Where-Object { $_.isEnabled } | ForEach-Object { $_.value })
    userAssignmentRequired = $VerifiedServicePrincipal.appRoleAssignmentRequired
    graphApplicationConsentRequested = [bool]$GrantGraphApplicationConsent
    roleGroupsRequested = [bool]$ConfigureRoleGroups
    githubVariablesRequested = [bool]$ConfigureGitHubVariables
    reportPath = $ResolvedReportPath
}

Write-Host ""
Write-Host "Microsoft Entra Portal setup completed and verified." -ForegroundColor Green
$Result

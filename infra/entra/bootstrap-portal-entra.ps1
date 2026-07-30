[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$TenantId,

    [string]$DisplayName = 'Skunkworks Academy Portal',

    [ValidatePattern('^https://')]
    [string]$PortalUrl = 'https://portal.skunkworksacademy.com',

    [ValidatePattern('^https://')]
    [string]$ApiUrl = 'https://skunkworks-academy-portal-api-za.azurewebsites.net'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function New-StableGuid {
    param([Parameter(Mandatory)][string]$Value)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
    $guidBytes = [byte[]]::new(16)
    [Array]::Copy($hash, $guidBytes, 16)
    return [guid]::new($guidBytes)
}

$requiredModules = @('Microsoft.Graph.Authentication', 'Microsoft.Graph.Applications', 'Microsoft.Graph.Groups')
foreach ($module in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $module)) {
        throw "Missing PowerShell module '$module'. Install Microsoft.Graph with: Install-Module Microsoft.Graph -Scope CurrentUser"
    }
}

$scopes = @(
    'Application.ReadWrite.All',
    'AppRoleAssignment.ReadWrite.All',
    'Group.ReadWrite.All',
    'Directory.Read.All'
)

Connect-MgGraph -TenantId $TenantId -Scopes $scopes -NoWelcome

$context = Get-MgContext
if ($context.TenantId -ne $TenantId) {
    throw "Connected to tenant '$($context.TenantId)' instead of '$TenantId'."
}

$escapedName = $DisplayName.Replace("'", "''")
$app = Get-MgApplication -Filter "displayName eq '$escapedName'" -All | Select-Object -First 1

$roleDefinitions = @(
    @{ Value = 'Portal.Student';     DisplayName = 'Portal Student';     Description = 'Learner access to enrolled courses, labs and profile functions.' },
    @{ Value = 'Portal.Instructor';  DisplayName = 'Portal Instructor';  Description = 'Instructor access to cohorts, assessments and learner delivery functions.' },
    @{ Value = 'Portal.Staff';       DisplayName = 'Portal Staff';       Description = 'Operational access to enrolment, support and reporting functions.' },
    @{ Value = 'Portal.Admin';       DisplayName = 'Portal Administrator'; Description = 'Administrative access to portal configuration and governance.' }
)

$appRoles = foreach ($role in $roleDefinitions) {
    @{
        Id = New-StableGuid -Value "$DisplayName|$($role.Value)"
        AllowedMemberTypes = @('User')
        Description = $role.Description
        DisplayName = $role.DisplayName
        IsEnabled = $true
        Value = $role.Value
    }
}

$scopeId = New-StableGuid -Value "$DisplayName|access_as_user"
$identifierUri = "api://skunkworks-academy-portal"
$redirectUris = @(
    "$PortalUrl/auth/callback",
    "$PortalUrl/"
)

$appBody = @{
    DisplayName = $DisplayName
    SignInAudience = 'AzureADMyOrg'
    IdentifierUris = @($identifierUri)
    Spa = @{ RedirectUris = $redirectUris }
    Web = @{ HomePageUrl = $PortalUrl; LogoutUrl = "$PortalUrl/logout" }
    Api = @{
        Oauth2PermissionScopes = @(
            @{
                Id = $scopeId
                AdminConsentDescription = 'Allow the Portal to access the Portal API on behalf of the signed-in user.'
                AdminConsentDisplayName = 'Access Skunkworks Academy Portal API'
                IsEnabled = $true
                Type = 'User'
                UserConsentDescription = 'Allow this application to access the Portal API on your behalf.'
                UserConsentDisplayName = 'Access Skunkworks Academy Portal API'
                Value = 'access_as_user'
            }
        )
    }
    AppRoles = $appRoles
    OptionalClaims = @{
        IdToken = @(
            @{ Name = 'email'; Essential = $false },
            @{ Name = 'preferred_username'; Essential = $false }
        )
        AccessToken = @(
            @{ Name = 'email'; Essential = $false },
            @{ Name = 'preferred_username'; Essential = $false }
        )
    }
}

if (-not $app) {
    if ($PSCmdlet.ShouldProcess($DisplayName, 'Create Entra application registration')) {
        $app = New-MgApplication -BodyParameter $appBody
    }
}
else {
    if ($PSCmdlet.ShouldProcess($DisplayName, 'Update Entra application registration')) {
        Update-MgApplication -ApplicationId $app.Id -BodyParameter $appBody
        $app = Get-MgApplication -ApplicationId $app.Id
    }
}

$servicePrincipal = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" -All | Select-Object -First 1
if (-not $servicePrincipal -and $PSCmdlet.ShouldProcess($DisplayName, 'Create enterprise application service principal')) {
    $servicePrincipal = New-MgServicePrincipal -AppId $app.AppId
}

$groupMap = [ordered]@{
    'Skunkworks Academy Portal Learners'    = 'Portal.Student'
    'Skunkworks Academy Portal Instructors' = 'Portal.Instructor'
    'Skunkworks Academy Portal Staff'       = 'Portal.Staff'
    'Skunkworks Academy Portal Admins'      = 'Portal.Admin'
}

$createdGroups = @()
foreach ($groupName in $groupMap.Keys) {
    $escapedGroup = $groupName.Replace("'", "''")
    $group = Get-MgGroup -Filter "displayName eq '$escapedGroup'" -All | Select-Object -First 1
    if (-not $group -and $PSCmdlet.ShouldProcess($groupName, 'Create security group')) {
        $mailNickname = ($groupName -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
        $group = New-MgGroup -DisplayName $groupName -MailEnabled:$false -MailNickname $mailNickname -SecurityEnabled:$true
    }

    $roleValue = $groupMap[$groupName]
    $role = $app.AppRoles | Where-Object Value -eq $roleValue | Select-Object -First 1
    if (-not $role) { throw "App role '$roleValue' was not found after application update." }

    $existingAssignment = Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $servicePrincipal.Id -All |
        Where-Object { $_.PrincipalId -eq $group.Id -and $_.AppRoleId -eq $role.Id } |
        Select-Object -First 1

    if (-not $existingAssignment -and $PSCmdlet.ShouldProcess("$groupName -> $roleValue", 'Assign group to enterprise application role')) {
        New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $servicePrincipal.Id -BodyParameter @{
            PrincipalId = $group.Id
            ResourceId = $servicePrincipal.Id
            AppRoleId = $role.Id
        } | Out-Null
    }

    $createdGroups += [pscustomobject]@{
        GroupName = $groupName
        GroupId = $group.Id
        AppRole = $roleValue
    }
}

$result = [pscustomobject]@{
    TenantId = $TenantId
    ApplicationName = $DisplayName
    ClientId = $app.AppId
    ApplicationObjectId = $app.Id
    EnterpriseApplicationObjectId = $servicePrincipal.Id
    IdentifierUri = $identifierUri
    DelegatedScope = "$identifierUri/access_as_user"
    PortalUrl = $PortalUrl
    ApiUrl = $ApiUrl
    RedirectUris = $redirectUris
    Groups = $createdGroups
}

$result | ConvertTo-Json -Depth 6

Write-Host "`nNext actions:" -ForegroundColor Cyan
Write-Host '1. In Enterprise applications, set Assignment required? to Yes.'
Write-Host '2. Review API permissions and grant admin consent only where required.'
Write-Host '3. Add the ClientId and TenantId to the portal runtime configuration.'
Write-Host '4. Validate role claims with one test user per group before production rollout.'

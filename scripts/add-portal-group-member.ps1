<#
.SYNOPSIS
Adds a Microsoft Entra user to the Skunkworks Academy Portal security group for a selected portal role.

.DESCRIPTION
This script performs a validated, idempotent direct-membership assignment. It requires the user's real
Microsoft Entra user principal name and one of the supported portal roles. It does not use interactive
Read-Host prompts, so it is safe to run as a complete script from Windows PowerShell or PowerShell 7.

The script:
- validates the Microsoft Graph tenant connection;
- resolves the user and requires a non-empty directory object ID;
- resolves exactly one expected security group;
- detects existing direct membership;
- creates the membership only when required;
- verifies the result before printing success.

.EXAMPLE
.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "raydo@skunkworks.africa" `
    -Role Admin

.EXAMPLE
.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "learner@skunkworks.africa" `
    -Role Student `
    -UseDeviceAuthentication

.EXAMPLE
.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "trainer@skunkworks.africa" `
    -Role Instructor `
    -WhatIf
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$UserPrincipalName,

    [Parameter(Mandatory = $true)]
    [ValidateSet("Student", "Instructor", "Staff", "Admin")]
    [string]$Role,

    [ValidateNotNullOrEmpty()]
    [string]$TenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5",

    [switch]$UseDeviceAuthentication
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PortalGroups = @{
    Student    = "Skunkworks Academy Portal - Learners"
    Instructor = "Skunkworks Academy Portal - Instructors"
    Staff      = "Skunkworks Academy Portal - Operations"
    Admin      = "Skunkworks Academy Portal - Administrators"
}

$RequiredModules = @(
    "Microsoft.Graph.Authentication",
    "Microsoft.Graph.Users",
    "Microsoft.Graph.Groups"
)

$RequiredScopes = @(
    "User.Read.All",
    "Group.Read.All",
    "GroupMember.ReadWrite.All"
)

function Import-RequiredGraphModule {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ModuleName
    )

    if (-not (Get-Module -ListAvailable -Name $ModuleName)) {
        Write-Host "Installing required module: $ModuleName" -ForegroundColor Cyan
        Install-Module `
            -Name $ModuleName `
            -Scope CurrentUser `
            -Repository PSGallery `
            -Force `
            -AllowClobber `
            -ErrorAction Stop
    }

    Import-Module $ModuleName -ErrorAction Stop
}

function Connect-PortalGraph {
    $Context = Get-MgContext -ErrorAction SilentlyContinue
    $ContextScopes = if ($Context) { @($Context.Scopes) } else { @() }
    $MissingScopes = @($RequiredScopes | Where-Object { $ContextScopes -notcontains $_ })
    $NeedsConnection = (-not $Context) -or ($Context.TenantId -ne $TenantId) -or ($MissingScopes.Count -gt 0)

    if (-not $NeedsConnection) {
        return $Context
    }

    if ($Context) {
        Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    }

    $ConnectParameters = @{
        TenantId  = $TenantId
        Scopes    = $RequiredScopes
        NoWelcome = $true
    }

    if ($UseDeviceAuthentication) {
        $ConnectParameters["UseDeviceAuthentication"] = $true
    }

    Write-Host "Connecting to Microsoft Graph tenant $TenantId..." -ForegroundColor Cyan
    Connect-MgGraph @ConnectParameters | Out-Null

    $ConnectedContext = Get-MgContext
    if (-not $ConnectedContext) {
        throw "Microsoft Graph authentication was not completed."
    }

    if ($ConnectedContext.TenantId -ne $TenantId) {
        throw "Connected to tenant $($ConnectedContext.TenantId), but expected $TenantId."
    }

    return $ConnectedContext
}

foreach ($ModuleName in $RequiredModules) {
    Import-RequiredGraphModule -ModuleName $ModuleName
}

$GraphContext = Connect-PortalGraph
$TargetGroupName = $PortalGroups[$Role]

Write-Host "Resolving user: $UserPrincipalName" -ForegroundColor Cyan
try {
    $User = Get-MgUser `
        -UserId $UserPrincipalName `
        -Property Id,DisplayName,UserPrincipalName,Mail `
        -ErrorAction Stop
}
catch {
    throw "User '$UserPrincipalName' was not found in tenant $TenantId. Supply the user's real Microsoft Entra UPN, not a placeholder or pasted PowerShell text."
}

if (-not $User) {
    throw "Microsoft Graph did not return a user for '$UserPrincipalName'."
}

if ([string]::IsNullOrWhiteSpace([string]$User.Id)) {
    throw "Microsoft Graph returned '$UserPrincipalName' without a directory object ID. No membership request was sent."
}

$EscapedGroupName = $TargetGroupName.Replace("'", "''")
$Groups = @(
    Get-MgGroup `
        -Filter "displayName eq '$EscapedGroupName'" `
        -Property Id,DisplayName,SecurityEnabled,MailEnabled,GroupTypes `
        -All `
        -ErrorAction Stop
)

if ($Groups.Count -eq 0) {
    throw "Group '$TargetGroupName' was not found in tenant $TenantId. Run the portal role-group provisioning script first."
}

if ($Groups.Count -gt 1) {
    throw "More than one group has the display name '$TargetGroupName'. Resolve the duplicate groups before assigning members."
}

$Group = $Groups[0]

if ([string]::IsNullOrWhiteSpace([string]$Group.Id)) {
    throw "Group '$TargetGroupName' was returned without a directory object ID."
}

if (-not [bool]$Group.SecurityEnabled) {
    throw "Group '$TargetGroupName' exists but is not security-enabled. Portal app-role assignments require a security-enabled group."
}

Write-Host "User:   $($User.DisplayName) <$($User.UserPrincipalName)>" -ForegroundColor DarkCyan
Write-Host "Group:  $($Group.DisplayName)" -ForegroundColor DarkCyan
Write-Host "Role:   $Role" -ForegroundColor DarkCyan
Write-Host "Tenant: $($GraphContext.TenantId)" -ForegroundColor DarkCyan

$ExistingMembers = @(
    Get-MgGroupMember `
        -GroupId $Group.Id `
        -All `
        -ErrorAction Stop
)

$AlreadyMember = $null -ne ($ExistingMembers | Where-Object { $_.Id -eq $User.Id } | Select-Object -First 1)

if ($AlreadyMember) {
    Write-Host "$($User.UserPrincipalName) is already a direct member of $($Group.DisplayName)." -ForegroundColor Yellow

    [pscustomobject]@{
        Status            = "Existing"
        UserPrincipalName = $User.UserPrincipalName
        UserObjectId      = $User.Id
        Role              = $Role
        GroupDisplayName  = $Group.DisplayName
        GroupObjectId     = $Group.Id
        TenantId          = $TenantId
    }

    return
}

if (-not $PSCmdlet.ShouldProcess("$($User.UserPrincipalName) -> $($Group.DisplayName)", "Create direct group membership")) {
    return
}

$DirectoryObjectUrl = "https://graph.microsoft.com/v1.0/directoryObjects/$($User.Id)"

New-MgGroupMemberByRef `
    -GroupId $Group.Id `
    -BodyParameter @{ "@odata.id" = $DirectoryObjectUrl } `
    -ErrorAction Stop

$VerifiedMembers = @(
    Get-MgGroupMember `
        -GroupId $Group.Id `
        -All `
        -ErrorAction Stop
)

$MembershipVerified = $null -ne ($VerifiedMembers | Where-Object { $_.Id -eq $User.Id } | Select-Object -First 1)

if (-not $MembershipVerified) {
    throw "Microsoft Graph accepted the membership request, but verification failed for '$UserPrincipalName' in '$TargetGroupName'."
}

Write-Host "Membership successfully created and verified." -ForegroundColor Green
Write-Host "$($User.UserPrincipalName) -> $($Group.DisplayName)" -ForegroundColor Green

[pscustomobject]@{
    Status            = "Created"
    UserPrincipalName = $User.UserPrincipalName
    UserObjectId      = $User.Id
    Role              = $Role
    GroupDisplayName  = $Group.DisplayName
    GroupObjectId     = $Group.Id
    TenantId          = $TenantId
}

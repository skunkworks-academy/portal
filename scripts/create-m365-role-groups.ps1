<#
.SYNOPSIS
Creates Microsoft 365 / Teams role groups for the Skunkworks Academy Portal and assigns them to portal app roles.

.DESCRIPTION
This script creates or reuses three Microsoft 365 groups, Teams-enables each group, and assigns each group
to the matching Microsoft Entra Enterprise Application app role used by the portal.

Default role groups:
- Skunkworks Academy Portal - Students     -> Portal.Student
- Skunkworks Academy Portal - Instructors  -> Portal.Instructor
- Skunkworks Academy Portal - Staff        -> Portal.Staff

Run with a Microsoft 365 administrator account that can create groups, create Teams, read service principals,
and assign app roles.

.EXAMPLE
pwsh ./scripts/create-m365-role-groups.ps1

.EXAMPLE
pwsh ./scripts/create-m365-role-groups.ps1 -PortalEnterpriseAppDisplayName "Skunkworks Academy Portal API"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$PortalEnterpriseAppDisplayName = "Skunkworks Academy Portal API",
    [string]$Visibility = "Private",
    [switch]$CreateAdminGroup
)

$ErrorActionPreference = "Stop"

$RequiredModules = @(
    "Microsoft.Graph.Authentication",
    "Microsoft.Graph.Groups",
    "Microsoft.Graph.Applications",
    "Microsoft.Graph.Teams"
)

foreach ($Module in $RequiredModules) {
    if (-not (Get-Module -ListAvailable -Name $Module)) {
        Write-Host "Installing required module: $Module"
        Install-Module $Module -Scope CurrentUser -Force -AllowClobber
    }
    Import-Module $Module -ErrorAction Stop
}

$Scopes = @(
    "Group.ReadWrite.All",
    "Directory.ReadWrite.All",
    "Application.Read.All",
    "AppRoleAssignment.ReadWrite.All",
    "Team.Create",
    "TeamSettings.ReadWrite.All"
)

Write-Host "Connecting to Microsoft Graph..."
Connect-MgGraph -Scopes $Scopes -NoWelcome

$RoleGroups = @(
    [pscustomobject]@{
        DisplayName  = "Skunkworks Academy Portal - Students"
        MailNickname = "skw-portal-students"
        AppRole      = "Portal.Student"
        Description  = "Students and learners who need Skunkworks Academy Portal learner access."
    },
    [pscustomobject]@{
        DisplayName  = "Skunkworks Academy Portal - Instructors"
        MailNickname = "skw-portal-instructors"
        AppRole      = "Portal.Instructor"
        Description  = "Instructors, facilitators, and lab coaches who need Skunkworks Academy Portal instructor access."
    },
    [pscustomobject]@{
        DisplayName  = "Skunkworks Academy Portal - Staff"
        MailNickname = "skw-portal-staff"
        AppRole      = "Portal.Staff"
        Description  = "Training delivery, operations, and administrative staff who need Skunkworks Academy Portal staff access."
    }
)

if ($CreateAdminGroup) {
    $RoleGroups += [pscustomobject]@{
        DisplayName  = "Skunkworks Academy Portal - Admins"
        MailNickname = "skw-portal-admins"
        AppRole      = "Portal.Admin"
        Description  = "Portal administrators with elevated Skunkworks Academy Portal access."
    }
}

function Get-OrCreateUnifiedGroup {
    param(
        [Parameter(Mandatory)] [string]$DisplayName,
        [Parameter(Mandatory)] [string]$MailNickname,
        [Parameter(Mandatory)] [string]$Description
    )

    $EscapedName = $DisplayName.Replace("'", "''")
    $Existing = Get-MgGroup -Filter "displayName eq '$EscapedName'" -ConsistencyLevel eventual -CountVariable Count -All:$false

    if ($Existing) {
        Write-Host "Using existing group: $DisplayName"
        return $Existing | Select-Object -First 1
    }

    if ($PSCmdlet.ShouldProcess($DisplayName, "Create Microsoft 365 group")) {
        Write-Host "Creating Microsoft 365 group: $DisplayName"
        return New-MgGroup `
            -DisplayName $DisplayName `
            -Description $Description `
            -MailEnabled:$true `
            -MailNickname $MailNickname `
            -SecurityEnabled:$false `
            -GroupTypes @("Unified") `
            -Visibility $Visibility
    }
}

function Enable-TeamForGroup {
    param(
        [Parameter(Mandatory)] [string]$GroupId,
        [Parameter(Mandatory)] [string]$DisplayName
    )

    try {
        $ExistingTeam = Get-MgGroupTeam -GroupId $GroupId -ErrorAction Stop
        if ($ExistingTeam) {
            Write-Host "Team already exists for: $DisplayName"
            return
        }
    }
    catch {
        # A 404 here normally means the Microsoft 365 group is not Teams-enabled yet.
    }

    $TeamBody = @{
        memberSettings = @{
            allowCreateUpdateChannels = $true
            allowDeleteChannels       = $false
        }
        messagingSettings = @{
            allowUserEditMessages   = $true
            allowUserDeleteMessages = $true
        }
        funSettings = @{
            allowGiphy            = $true
            giphyContentRating    = "moderate"
            allowStickersAndMemes = $true
            allowCustomMemes      = $false
        }
    }

    if ($PSCmdlet.ShouldProcess($DisplayName, "Enable Microsoft Team for group")) {
        Write-Host "Teams-enabling group: $DisplayName"
        New-MgGroupTeam -GroupId $GroupId -BodyParameter $TeamBody | Out-Null
    }
}

function Add-GroupToAppRole {
    param(
        [Parameter(Mandatory)] [string]$GroupId,
        [Parameter(Mandatory)] [string]$GroupDisplayName,
        [Parameter(Mandatory)] [string]$ServicePrincipalId,
        [Parameter(Mandatory)] [string]$AppRoleId,
        [Parameter(Mandatory)] [string]$AppRoleName
    )

    $ExistingAssignments = Get-MgGroupAppRoleAssignment -GroupId $GroupId -All
    $AlreadyAssigned = $ExistingAssignments | Where-Object {
        $_.ResourceId -eq $ServicePrincipalId -and $_.AppRoleId -eq $AppRoleId
    }

    if ($AlreadyAssigned) {
        Write-Host "App role already assigned: $GroupDisplayName -> $AppRoleName"
        return
    }

    $Body = @{
        principalId = $GroupId
        resourceId  = $ServicePrincipalId
        appRoleId   = $AppRoleId
    }

    if ($PSCmdlet.ShouldProcess($GroupDisplayName, "Assign app role $AppRoleName")) {
        Write-Host "Assigning app role: $GroupDisplayName -> $AppRoleName"
        New-MgGroupAppRoleAssignment -GroupId $GroupId -BodyParameter $Body | Out-Null
    }
}

Write-Host "Resolving Enterprise Application service principal: $PortalEnterpriseAppDisplayName"
$EscapedAppName = $PortalEnterpriseAppDisplayName.Replace("'", "''")
$ServicePrincipal = Get-MgServicePrincipal -Filter "displayName eq '$EscapedAppName'" -ConsistencyLevel eventual -CountVariable Count -All:$false | Select-Object -First 1

if (-not $ServicePrincipal) {
    throw "Could not find Enterprise Application service principal named '$PortalEnterpriseAppDisplayName'. Check the display name in Microsoft Entra ID > Enterprise applications."
}

foreach ($RoleGroup in $RoleGroups) {
    $AppRole = $ServicePrincipal.AppRoles | Where-Object { $_.DisplayName -eq $RoleGroup.AppRole -or $_.Value -eq $RoleGroup.AppRole } | Select-Object -First 1

    if (-not $AppRole) {
        throw "Could not find app role '$($RoleGroup.AppRole)' on Enterprise Application '$PortalEnterpriseAppDisplayName'."
    }

    $Group = Get-OrCreateUnifiedGroup -DisplayName $RoleGroup.DisplayName -MailNickname $RoleGroup.MailNickname -Description $RoleGroup.Description

    if (-not $Group) {
        throw "Group creation skipped or failed for '$($RoleGroup.DisplayName)'."
    }

    Enable-TeamForGroup -GroupId $Group.Id -DisplayName $RoleGroup.DisplayName
    Add-GroupToAppRole `
        -GroupId $Group.Id `
        -GroupDisplayName $RoleGroup.DisplayName `
        -ServicePrincipalId $ServicePrincipal.Id `
        -AppRoleId $AppRole.Id `
        -AppRoleName $RoleGroup.AppRole
}

Write-Host "Completed Skunkworks Academy Portal Microsoft 365 role group setup."
Write-Host "Next: add users to the correct group and test portal login for Student, Instructor, and Staff accounts."

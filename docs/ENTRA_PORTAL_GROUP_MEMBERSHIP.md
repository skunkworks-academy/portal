# Microsoft Entra Portal group membership

Use the repository script instead of pasting a multi-block PowerShell workflow line by line.

The script requires two explicit parameters:

- `UserPrincipalName`: the user's real Microsoft Entra user principal name.
- `Role`: one of `Student`, `Instructor`, `Staff`, or `Admin`.

## Role-group mapping

| Role parameter | Security group | App role |
|---|---|---|
| `Student` | `Skunkworks Academy Portal - Learners` | `Portal.Student` |
| `Instructor` | `Skunkworks Academy Portal - Instructors` | `Portal.Instructor` |
| `Staff` | `Skunkworks Academy Portal - Operations` | `Portal.Staff` |
| `Admin` | `Skunkworks Academy Portal - Administrators` | `Portal.Admin` |

## Run from Windows PowerShell

From the repository root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "raydo@skunkworks.africa" `
    -Role Admin
```

Replace the example UPN with the actual account to assign.

For a learner:

```powershell
.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "learner@skunkworks.africa" `
    -Role Student
```

For device-code authentication:

```powershell
.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "trainer@skunkworks.africa" `
    -Role Instructor `
    -UseDeviceAuthentication
```

Use `-WhatIf` to validate resolution without changing membership:

```powershell
.\scripts\add-portal-group-member.ps1 `
    -UserPrincipalName "operations@skunkworks.africa" `
    -Role Staff `
    -WhatIf
```

## Behaviour

The script stops before sending a membership request when:

- the user cannot be resolved;
- the user has no directory object ID;
- the expected group does not exist;
- duplicate groups have the same display name;
- the group is not security-enabled;
- the Graph tenant does not match the Portal tenant.

It only prints a success message after Microsoft Graph membership verification succeeds. Existing direct membership is treated as an idempotent success and reported as `Existing`.

## Why the earlier command failed

The interactive prompt received pasted PowerShell text instead of a real UPN. The failed lookup left the user object empty, which produced a directory-object URL without an object ID. Continuing to paste later blocks also detached `else` from its original `if` statement.

Running the checked-in script as one command prevents those partial-state and parser failures.

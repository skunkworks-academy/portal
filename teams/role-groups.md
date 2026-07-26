# Microsoft 365 Teams Role Groups

This guide defines the three Microsoft 365 / Microsoft Teams role groups required by the Skunkworks Academy Portal.

The portal already uses the following application roles:

```text
Portal.Student
Portal.Instructor
Portal.Staff
Portal.Admin
```

The required Microsoft 365 groups are:

| Portal role | Microsoft 365 group / Team name | Mail nickname | Entra app role assignment |
|---|---|---|---|
| Student | Skunkworks Academy Portal - Students | skw-portal-students | Portal.Student |
| Instructor | Skunkworks Academy Portal - Instructors | skw-portal-instructors | Portal.Instructor |
| Staff | Skunkworks Academy Portal - Staff | skw-portal-staff | Portal.Staff |

## Target behaviour

1. Each role has its own Microsoft 365 group.
2. Each group is Teams-enabled so it appears as a Microsoft Teams workspace.
3. Group membership controls the portal role through Microsoft Entra app role assignment.
4. The portal continues to read the role from the Microsoft Entra token claims.
5. The Teams app remains a portal surface only. Teams installation does not replace Entra authorization.

## Recommended structure

```text
Microsoft Teams
├── Skunkworks Academy Portal - Students
│   └── General
├── Skunkworks Academy Portal - Instructors
│   └── General
└── Skunkworks Academy Portal - Staff
    └── General
```

## Role mapping

| Group | Intended users | Portal access |
|---|---|---|
| Skunkworks Academy Portal - Students | Learners, delegates, programme participants | Course catalogue, class registration, enrolled classes, learner resources, profile |
| Skunkworks Academy Portal - Instructors | Contract instructors, trainers, facilitators, lab coaches | Instructor jobs, applications, class monitoring, profile, CV upload, instructor resources |
| Skunkworks Academy Portal - Staff | Training delivery, operations, administrators, programme coordinators | Job posting, application review, instructor monitoring, student monitoring, scheduling, settings |

## Manual admin setup

Use this path in the Microsoft Entra admin center:

```text
Microsoft Entra admin center
→ Identity
→ Groups
→ All groups
→ New group
```

Create three Microsoft 365 groups:

```text
Skunkworks Academy Portal - Students
Skunkworks Academy Portal - Instructors
Skunkworks Academy Portal - Staff
```

Then assign each group to the portal Enterprise Application:

```text
Microsoft Entra admin center
→ Enterprise applications
→ Skunkworks Academy Portal API
→ Users and groups
→ Add user/group
→ Select group
→ Select role
→ Assign
```

Assign the groups as follows:

```text
Skunkworks Academy Portal - Students     → Portal.Student
Skunkworks Academy Portal - Instructors  → Portal.Instructor
Skunkworks Academy Portal - Staff        → Portal.Staff
```

## Automated setup

Run the PowerShell script from the repository root:

```powershell
pwsh ./scripts/create-m365-role-groups.ps1
```

The script creates or reuses the three Microsoft 365 groups, Teams-enables them, and assigns each group to the corresponding portal app role.

## Required administrator permissions

The executing administrator needs enough Microsoft Graph and Entra permissions to:

- create Microsoft 365 groups;
- create Microsoft Teams from Microsoft 365 groups;
- read the portal Enterprise Application service principal;
- assign groups to application roles.

Typical delegated Graph scopes used by the script:

```text
Group.ReadWrite.All
Directory.ReadWrite.All
Application.Read.All
AppRoleAssignment.ReadWrite.All
Team.Create
TeamSettings.ReadWrite.All
```

## Verification checklist

After setup, verify:

```text
1. The three groups exist in Microsoft Entra ID.
2. The three groups appear as Teams in Microsoft Teams.
3. Each group has the correct users assigned.
4. Each group is assigned to the correct Enterprise Application app role.
5. A Student user signs in and sees only the Student workspace.
6. An Instructor user signs in and sees only the Instructor workspace.
7. A Staff user signs in and sees Staff operations.
8. Staff-only tabs remain inaccessible to Student and Instructor users.
```

## Notes

- Group-based application assignment may require Microsoft Entra ID P1 or P2 licensing.
- Nested group membership should not be used for portal authorization because group-based app assignment does not cascade to nested groups.
- Microsoft 365 groups are recommended here because they can be Teams-enabled and still be assigned to the portal Enterprise Application.
- For stricter access control, create a fourth group named `Skunkworks Academy Portal - Admins` and assign it to `Portal.Admin`.

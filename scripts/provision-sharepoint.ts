import { ClientSecretCredential } from "@azure/identity";

const graphRoot = "https://graph.microsoft.com/v1.0";
const tenantId = required("GRAPH_TENANT_ID");
const clientId = required("API_CLIENT_ID");
const clientSecret = required("API_CLIENT_SECRET");
const hostname = required("SHAREPOINT_HOSTNAME");
const sitePath = required("SHAREPOINT_SITE_PATH");
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

const lists = [
  {
    displayName: "JobPostings",
    columns: [
      textColumn("Programme"),
      choiceColumn("Modality", ["Hybrid", "Remote", "On campus"]),
      textColumn("RateBand"),
      dateColumn("ClosingDate"),
      choiceColumn("Status", ["Draft", "Live", "Closed"]),
      multilineColumn("Description"),
      numberColumn("Applicants")
    ]
  },
  {
    displayName: "Applications",
    columns: [
      textColumn("JobId"),
      textColumn("JobTitle"),
      textColumn("ApplicantName"),
      textColumn("ApplicantEmail"),
      textColumn("Phone"),
      textColumn("Discipline"),
      textColumn("Availability"),
      multilineColumn("Experience"),
      choiceColumn("Status", ["Submitted", "Screening", "Interview", "Offer", "Rejected"]),
      textColumn("Owner"),
      dateTimeColumn("SubmittedAt"),
      textColumn("DocumentUrl"),
      textColumn("ApplicantObjectId"),
      textColumn("ApplicantTenantId")
    ]
  },
  {
    displayName: "PortalProfiles",
    columns: [
      textColumn("ObjectId"),
      textColumn("DisplayName"),
      textColumn("Email"),
      choiceColumn("PortalRole", ["Student", "Instructor", "Staff"]),
      textColumn("Phone"),
      textColumn("Location"),
      multilineColumn("Bio"),
      textColumn("CvFileName"),
      textColumn("CvDocumentUrl"),
      dateTimeColumn("UpdatedAt")
    ]
  },
  {
    displayName: "Candidates",
    columns: [
      textColumn("ApplicationId"),
      textColumn("ApplicantName"),
      textColumn("ApplicantEmail"),
      textColumn("Discipline"),
      choiceColumn("Status", ["Screening", "Interview", "Offer", "Active", "Inactive"]),
      textColumn("Owner"),
      textColumn("NextStep")
    ]
  },
  {
    displayName: "OnboardingTasks",
    columns: [
      textColumn("CandidateName"),
      textColumn("Owner"),
      dateColumn("DueDate"),
      choiceColumn("Status", ["Due", "InProgress", "Ready", "Complete"]),
      multilineColumn("Detail")
    ]
  },
  {
    displayName: "AuditEvents",
    columns: [
      textColumn("ActorName"),
      textColumn("ActorEmail"),
      textColumn("ActorTenantId"),
      textColumn("TargetId"),
      dateTimeColumn("OccurredAt")
    ]
  }
];

const libraries = ["ApplicantUploads", "InstructorDocuments"];

async function main() {
  const site = await graph<{ id: string }>(`/sites/${hostname}:${sitePath}`);
  const existingLists = await graph<{ value: Array<{ displayName: string }> }>(`/sites/${site.id}/lists?$select=displayName`);
  const existingNames = new Set(existingLists.value.map((list) => list.displayName));

  for (const list of lists) {
    if (existingNames.has(list.displayName)) {
      console.log(`List exists: ${list.displayName}`);
      continue;
    }
    await graph(`/sites/${site.id}/lists`, {
      method: "POST",
      body: JSON.stringify({
        displayName: list.displayName,
        list: { template: "genericList" },
        columns: list.columns
      })
    });
    console.log(`Created list: ${list.displayName}`);
  }

  for (const library of libraries) {
    if (existingNames.has(library)) {
      console.log(`Library exists: ${library}`);
      continue;
    }
    await graph(`/sites/${site.id}/lists`, {
      method: "POST",
      body: JSON.stringify({
        displayName: library,
        list: { template: "documentLibrary" }
      })
    });
    console.log(`Created library: ${library}`);
  }
}

async function graph<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  if (!token) throw new Error("Unable to acquire Graph token.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${graphRoot}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function textColumn(name: string) {
  return { name, text: {} };
}

function multilineColumn(name: string) {
  return { name, text: { allowMultipleLines: true } };
}

function numberColumn(name: string) {
  return { name, number: {} };
}

function dateColumn(name: string) {
  return { name, dateTime: { format: "dateOnly" } };
}

function dateTimeColumn(name: string) {
  return { name, dateTime: { format: "dateTime" } };
}

function choiceColumn(name: string, choices: string[]) {
  return { name, choice: { choices, displayAs: "dropDownMenu" } };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

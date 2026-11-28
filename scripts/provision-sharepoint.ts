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
    displayName: "Courses",
    columns: [
      textColumn("Level"),
      textColumn("Duration"),
      multilineColumn("Description"),
      choiceColumn("Status", ["Draft", "Live", "Archived"])
    ]
  },
  {
    displayName: "ClassSessions",
    columns: [
      textColumn("CourseId"),
      textColumn("CourseTitle"),
      textColumn("Schedule"),
      textColumn("Modality"),
      textColumn("Instructor"),
      numberColumn("Seats"),
      numberColumn("Enrolled"),
      choiceColumn("Status", ["Scheduled", "Open", "Full", "InProgress", "Complete", "Cancelled"])
    ]
  },
  {
    displayName: "ClassRegistrations",
    columns: [
      textColumn("ClassId"),
      textColumn("ClassTitle"),
      textColumn("CourseId"),
      textColumn("CourseTitle"),
      textColumn("StudentName"),
      textColumn("StudentEmail"),
      textColumn("StudentObjectId"),
      choiceColumn("Status", ["Registered", "Waitlisted", "Cancelled"]),
      dateTimeColumn("RegisteredAt")
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

const courseSeeds = [
  {
    Title: "Applied AI Tools",
    Level: "Short course",
    Duration: "4 weeks",
    Description: "Prompt workflows, responsible use, automation, and workplace AI productivity.",
    Status: "Live"
  },
  {
    Title: "Security Analyst Academy",
    Level: "Professional track",
    Duration: "12 weeks",
    Description: "Security fundamentals, labs, incident response, and analyst capstone work.",
    Status: "Live"
  },
  {
    Title: "Cloud Practitioner Track",
    Level: "Foundation",
    Duration: "8 weeks",
    Description: "Cloud fundamentals, deployment practice, troubleshooting, and exam readiness.",
    Status: "Live"
  }
];

const classSeeds = [
  {
    Title: "AI Tools June Cohort",
    CourseId: "ai-tools",
    CourseTitle: "Applied AI Tools",
    Schedule: "Tue and Thu, 18:00",
    Modality: "Hybrid",
    Instructor: "Pending assignment",
    Seats: 24,
    Enrolled: 0,
    Status: "Open"
  },
  {
    Title: "Security Analyst July Cohort",
    CourseId: "cybersecurity",
    CourseTitle: "Security Analyst Academy",
    Schedule: "Mon and Wed, 17:30",
    Modality: "Hybrid",
    Instructor: "Pending assignment",
    Seats: 18,
    Enrolled: 0,
    Status: "Open"
  },
  {
    Title: "Cloud Practitioner June Cohort",
    CourseId: "cloud",
    CourseTitle: "Cloud Practitioner Track",
    Schedule: "Saturday, 09:00",
    Modality: "On campus",
    Instructor: "Pending assignment",
    Seats: 30,
    Enrolled: 0,
    Status: "Open"
  }
];

async function main() {
  const site = await graph<{ id: string }>(`/sites/${hostname}:${sitePath}`);
  if (process.argv.includes("--profile-schema")) {
    await ensureProfileSchema(site.id);
    return;
  }
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

  await seedList(site.id, "Courses", courseSeeds);
  await seedList(site.id, "ClassSessions", classSeeds);
}

async function schemaCollection<T>(path: string): Promise<T[]> {
  const values: T[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graph(next);
    values.push(...page.value);
    next = undefined;
    if (page["@odata.nextLink"]) {
      const target = new URL(page["@odata.nextLink"]);
      if (target.origin !== "https://graph.microsoft.com" || target.pathname !== "/v1.0" + path.split("?")[0]) throw new Error("Unexpected schema page");
      next = target.pathname.slice("/v1.0".length) + target.search;
    }
  }
  return values;
}

/** Maintain only the two lists used by a profile save. Do not read or seed any list items. */
async function ensureProfileSchema(siteId: string) {
  const root = `/sites/${siteId}/lists`;
  const available = await schemaCollection<{ id: string; displayName: string }>(root + "?$select=id,displayName");
  for (const definition of lists.filter(list => ["PortalProfiles", "AuditEvents"].includes(list.displayName))) {
    const matches = available.filter(list => list.displayName === definition.displayName);
    if (matches.length > 1) throw new Error("Ambiguous profile list: " + definition.displayName);
    const existing = matches[0] ?? await graph<{ id: string }>(root, {
      method: "POST", body: JSON.stringify({ displayName: definition.displayName, list: { template: "genericList" }, columns: definition.columns })
    });
    const path = root + "/" + existing.id + "/columns";
    const readColumns = async () => {
      const visible = await schemaCollection<{ name: string; readOnly?: boolean }>(path + "?$select=name,readOnly");
      return new Map(visible.map(column => [column.name, column]));
    };
    const found = await readColumns();
    for (const spec of definition.columns) {
      if (found.has(spec.name)) continue;
      try { await graph(path, { method: "POST", body: JSON.stringify(spec) }); }
      catch (error) { if (!(await readColumns()).has(spec.name)) throw error; }
      console.log("Provisioned profile schema column " + definition.displayName + "." + spec.name);
    }
    const verified = await readColumns();
    for (const spec of definition.columns) {
      const column = verified.get(spec.name);
      if (!column || column.readOnly) throw new Error("Unavailable profile column: " + definition.displayName + "." + spec.name);
    }
    console.log("Verified profile schema for " + definition.displayName);
  }
}

async function seedList(siteId: string, displayName: string, rows: Array<Record<string, unknown>>) {
  const lists = await graph<{ value: Array<{ id: string; displayName: string }> }>(`/sites/${siteId}/lists?$select=id,displayName`);
  const list = lists.value.find((item) => item.displayName === displayName);
  if (!list) throw new Error(`List not found after provisioning: ${displayName}`);

  const existing = await graph<{ value: Array<{ id: string }> }>(`/sites/${siteId}/lists/${list.id}/items?$top=1`);
  if (existing.value.length) {
    console.log(`Seed skipped: ${displayName} already has records`);
    return;
  }

  for (const fields of rows) {
    await graph(`/sites/${siteId}/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ fields })
    });
  }
  console.log(`Seeded ${rows.length} records: ${displayName}`);
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

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
    displayName: "PaymentTransactions",
    columns: [
      textColumn("PlanId"),
      textColumn("PlanName"),
      choiceColumn("Gateway", ["payfast", "paypal"]),
      choiceColumn("Currency", ["ZAR", "USD"]),
      numberColumn("Amount"),
      choiceColumn("Status", ["Created", "Redirected", "Approved", "Captured", "Complete", "Failed", "Cancelled", "Pending"]),
      textColumn("Entitlement"),
      textColumn("CustomerEmail"),
      textColumn("CustomerName"),
      textColumn("MerchantReference"),
      textColumn("ProviderReference"),
      textColumn("PaypalOrderId"),
      textColumn("PaypalSubscriptionId"),
      dateTimeColumn("CreatedAt"),
      dateTimeColumn("UpdatedAt"),
      multilineColumn("RawProviderStatus")
    ]
  },
  {
    displayName: "Entitlements",
    columns: [
      textColumn("CustomerEmail"),
      textColumn("CustomerName"),
      textColumn("PlanId"),
      textColumn("PlanName"),
      textColumn("Entitlement"),
      choiceColumn("Status", ["Active", "Suspended", "Cancelled", "Expired"]),
      textColumn("PaymentTransactionId"),
      textColumn("ProviderReference"),
      dateTimeColumn("GrantedAt"),
      dateTimeColumn("ValidUntil")
    ]
  },
  {
    displayName: "CourseEnrollments",
    columns: [
      textColumn("CourseId"),
      textColumn("CourseTitle"),
      textColumn("LearnerObjectId"),
      textColumn("LearnerTenantId"),
      textColumn("LearnerEmail"),
      textColumn("LearnerName"),
      choiceColumn("Status", ["Submitted", "PendingPayment", "Active", "Waitlisted", "Suspended", "Cancelled", "Completed", "Rejected"]),
      choiceColumn("Source", ["checkout", "portal", "admin", "migration"]),
      textColumn("PlanId"),
      choiceColumn("Gateway", ["payfast", "paypal", "manual", "none"]),
      textColumn("PaymentTransactionId"),
      textColumn("EntitlementId"),
      textColumn("ProviderReference"),
      multilineColumn("ReturnUrl"),
      dateTimeColumn("SubmittedAt"),
      dateTimeColumn("ActivatedAt"),
      dateTimeColumn("UpdatedAt"),
      multilineColumn("Notes")
    ]
  }
];

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

function textColumn(name: string) {
  return { name, text: {} };
}

function multilineColumn(name: string) {
  return { name, text: { allowMultipleLines: true, appendChangesToExistingText: false } };
}

function numberColumn(name: string) {
  return { name, number: { decimalPlaces: "two" } };
}

function dateTimeColumn(name: string) {
  return { name, dateTime: { displayAs: "default", format: "dateTime" } };
}

function choiceColumn(name: string, choices: string[]) {
  return { name, choice: { allowTextEntry: false, choices, displayAs: "dropDownMenu" } };
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

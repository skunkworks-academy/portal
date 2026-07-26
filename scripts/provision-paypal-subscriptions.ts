import crypto from "node:crypto";

type JsonRecord = Record<string, unknown>;

type PlanDefinition = {
  env: string;
  name: string;
  description: string;
  amount: string;
};

const clientId = required("PAYPAL_CLIENT_ID");
const clientSecret = required("PAYPAL_CLIENT_SECRET");
const apiBase = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";
const publicApiBase = (process.env.PUBLIC_API_BASE_URL ?? "http://localhost:7071/api").replace(/\/$/, "");

const planDefinitions: PlanDefinition[] = [
  {
    env: "PAYPAL_PLAN_STARTER_MONTHLY",
    name: "Skunkworks Academy Starter",
    description: "Monthly Starter learner access.",
    amount: "9.00"
  },
  {
    env: "PAYPAL_PLAN_PRO_MONTHLY",
    name: "Skunkworks Academy Pro",
    description: "Monthly Pro learner, course and lab access.",
    amount: "22.00"
  },
  {
    env: "PAYPAL_PLAN_MENTOR_MONTHLY",
    name: "Skunkworks Academy Mentor",
    description: "Monthly mentor-supported learner access.",
    amount: "55.00"
  },
  {
    env: "PAYPAL_PLAN_TEAM_SEAT_MONTHLY",
    name: "Skunkworks Academy Team Seat",
    description: "Monthly team learner seat.",
    amount: "25.00"
  }
];

async function main() {
  const token = await accessToken();
  const productId = process.env.PAYPAL_PRODUCT_ID || await createProduct(token);
  const settings: Record<string, string> = { PAYPAL_PRODUCT_ID: productId };

  for (const definition of planDefinitions) {
    const existing = process.env[definition.env];
    settings[definition.env] = existing || await createPlan(token, productId, definition);
  }

  settings.PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || await ensureWebhook(token);

  console.log("\nPayPal subscription resources are ready.");
  console.log("Add these application settings to the Azure Function App:");
  for (const [name, value] of Object.entries(settings)) {
    console.log(`${name}=${value}`);
  }
  console.log(`PAYPAL_ENV=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`);
}

async function accessToken() {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const body = await json(response);
  const token = stringProp(body, "access_token");
  if (!response.ok || !token) throw new Error(`PayPal access token failed: ${response.status} ${JSON.stringify(body)}`);
  return token;
}

async function createProduct(token: string) {
  const body = await paypal(token, "/v1/catalogs/products", {
    method: "POST",
    requestId: requestId("academy-product"),
    body: {
      name: "Skunkworks Academy Subscriptions",
      description: "Recurring learner, mentor and team access subscriptions.",
      type: "SERVICE",
      category: "SOFTWARE",
      image_url: "https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png",
      home_url: "https://skunkworksacademy.com/plans-and-purchases/"
    }
  });
  const productId = stringProp(body, "id");
  if (!productId) throw new Error("PayPal product creation did not return an ID.");
  console.log(`Created PayPal product: ${productId}`);
  return productId;
}

async function createPlan(token: string, productId: string, definition: PlanDefinition) {
  const body = await paypal(token, "/v1/billing/plans", {
    method: "POST",
    requestId: requestId(definition.env.toLowerCase()),
    body: {
      product_id: productId,
      name: definition.name,
      description: definition.description,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: definition.amount,
              currency_code: "USD"
            }
          }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: {
          value: "0.00",
          currency_code: "USD"
        },
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3
      }
    }
  });
  const planId = stringProp(body, "id");
  if (!planId) throw new Error(`PayPal plan creation did not return an ID for ${definition.env}.`);
  console.log(`Created ${definition.env}: ${planId}`);
  return planId;
}

async function ensureWebhook(token: string) {
  const webhookUrl = `${publicApiBase}/webhooks/paypal`;
  const existing = await paypal(token, "/v1/notifications/webhooks", { method: "GET" });
  const webhooks = Array.isArray(existing.webhooks) ? existing.webhooks : [];
  const match = webhooks.find((entry) => isRecord(entry) && stringProp(entry, "url") === webhookUrl);
  if (isRecord(match) && stringProp(match, "id")) {
    const id = stringProp(match, "id");
    console.log(`Using existing PayPal webhook: ${id}`);
    return id;
  }

  const body = await paypal(token, "/v1/notifications/webhooks", {
    method: "POST",
    requestId: requestId("academy-webhook"),
    body: {
      url: webhookUrl,
      event_types: [
        { name: "BILLING.SUBSCRIPTION.CREATED" },
        { name: "BILLING.SUBSCRIPTION.ACTIVATED" },
        { name: "BILLING.SUBSCRIPTION.UPDATED" },
        { name: "BILLING.SUBSCRIPTION.SUSPENDED" },
        { name: "BILLING.SUBSCRIPTION.CANCELLED" },
        { name: "BILLING.SUBSCRIPTION.EXPIRED" },
        { name: "BILLING.SUBSCRIPTION.PAYMENT.FAILED" },
        { name: "PAYMENT.SALE.COMPLETED" },
        { name: "PAYMENT.SALE.REFUNDED" },
        { name: "PAYMENT.SALE.REVERSED" }
      ]
    }
  });
  const webhookId = stringProp(body, "id");
  if (!webhookId) throw new Error("PayPal webhook creation did not return an ID.");
  console.log(`Created PayPal webhook: ${webhookId}`);
  return webhookId;
}

async function paypal(
  token: string,
  path: string,
  options: { method: string; body?: JsonRecord; requestId?: string }
) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  });
  if (options.requestId) headers.set("PayPal-Request-Id", options.requestId);

  const response = await fetch(`${apiBase}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await json(response);
  if (!response.ok) throw new Error(`PayPal ${options.method} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function json(response: Response): Promise<JsonRecord> {
  try {
    const value = await response.json() as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function requestId(scope: string) {
  return `swa-${scope}-${crypto.randomUUID()}`.slice(0, 108);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringProp(value: JsonRecord, key: string) {
  const result = value[key];
  return typeof result === "string" ? result.trim() : "";
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

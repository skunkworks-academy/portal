import crypto from "node:crypto";
import { ClientSecretCredential } from "@azure/identity";
import type { HttpRequest } from "@azure/functions";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";

type Gateway = "payfast" | "paypal";

type GraphListItem = {
  id: string;
  fields: Record<string, unknown>;
};

type GraphListResponse = {
  value: GraphListItem[];
};

interface Plan {
  id: string;
  name: string;
  description: string;
  interval: "month" | "once";
  entitlement: string;
  features: string[];
  zar: number;
  usd: number;
  paypalPlanEnv: string;
}

interface Transaction {
  id: string;
  planId: string;
  planName: string;
  gateway: Gateway;
  currency: string;
  amount: number;
  entitlement: string;
  customerEmail: string;
  customerName: string;
  merchantReference: string;
  paypalOrderId: string;
  paypalSubscriptionId: string;
}

const graphRoot = "https://graph.microsoft.com/v1.0";
const productionApiBase = "https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api";
const portalCheckout = "https://portal.skunkworksacademy.com/checkout/";
let credential: ClientSecretCredential | undefined;
let siteIdCache = "";
const listCache = new Map<string, string>();

export const plans: Plan[] = [
  {
    id: "starter-monthly",
    name: "Starter",
    description: "Entry-level Academy access for individual learners starting a guided learning path.",
    interval: "month",
    entitlement: "academy.starter",
    zar: 149,
    usd: 9,
    paypalPlanEnv: "PAYPAL_PLAN_STARTER_MONTHLY",
    features: ["Learner portal access", "Starter catalogue", "Community resources", "Progress evidence"]
  },
  {
    id: "pro-monthly",
    name: "Pro",
    description: "Expanded course, lab and certificate pathway access for active learners.",
    interval: "month",
    entitlement: "academy.pro",
    zar: 399,
    usd: 22,
    paypalPlanEnv: "PAYPAL_PLAN_PRO_MONTHLY",
    features: ["Everything in Starter", "Expanded course catalogue", "Guided labs", "Certificate pathway tracking"]
  },
  {
    id: "mentor-monthly",
    name: "Mentor",
    description: "Premium mentor-supported learning access for advanced upskilling and placement readiness.",
    interval: "month",
    entitlement: "academy.mentor",
    zar: 999,
    usd: 55,
    paypalPlanEnv: "PAYPAL_PLAN_MENTOR_MONTHLY",
    features: ["Everything in Pro", "Mentor support", "Portfolio review", "Instructor-led support windows"]
  },
  {
    id: "team-seat-monthly",
    name: "Team Seat",
    description: "Per-seat team access for business, reseller and cohort-based training delivery.",
    interval: "month",
    entitlement: "academy.team_seat",
    zar: 450,
    usd: 25,
    paypalPlanEnv: "PAYPAL_PLAN_TEAM_SEAT_MONTHLY",
    features: ["Team learner seat", "Admin reporting", "Cohort tracking", "Partner-ready delivery"]
  }
];

export function publicCheckoutPlans() {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    interval: plan.interval,
    entitlement: plan.entitlement,
    features: plan.features,
    zar: plan.zar,
    usd: plan.usd,
    paypalPlanId: paypalPlanId(plan, false),
    gateways: ["payfast", "paypal"] as Gateway[],
    currencyNote: "PayFast uses ZAR. PayPal subscriptions use USD."
  }));
}

export function publicPayPalConfig() {
  const clientId = clean(process.env.PAYPAL_CLIENT_ID);
  return {
    enabled: Boolean(clientId && plans.some((plan) => paypalPlanId(plan, false))),
    clientId,
    environment: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
    currency: "USD",
    intent: "subscription",
    vault: true
  };
}

export async function createCheckoutSession(request: HttpRequest) {
  const input = await readCheckoutInput(request);
  const plan = getPlan(input.planId);
  const gateway = getGateway(input.gateway);
  const customer = validateCustomer(input.customerEmail, input.customerName);

  if (gateway === "paypal") {
    return createPayPalIntent(plan, customer.email, customer.name);
  }

  const transaction = await createTransaction(plan, gateway, plan.zar, "ZAR", customer.email, customer.name);
  const successUrl = safeUrl(input.successUrl, `${portalCheckout}success/`);
  const cancelUrl = safeUrl(input.cancelUrl, `${portalCheckout}cancel/`);
  const payfast = buildPayFastCheckout(plan, transaction, successUrl, cancelUrl);

  await updateTransaction(transaction.id, {
    Status: "Redirected",
    ProviderReference: transaction.merchantReference,
    UpdatedAt: now()
  });

  return {
    gateway,
    transactionId: transaction.id,
    checkoutMode: "form-post",
    action: payfast.action,
    method: "POST",
    fields: payfast.fields
  };
}

export async function createPayPalSubscriptionIntent(request: HttpRequest) {
  const input = await readCheckoutInput(request);
  const plan = getPlan(input.planId);
  const customer = validateCustomer(input.customerEmail, input.customerName);
  return createPayPalIntent(plan, customer.email, customer.name);
}

export async function approvePayPalSubscription(request: HttpRequest) {
  const payload = await request.json() as { transactionId?: string; subscriptionId?: string };
  const transactionId = clean(payload.transactionId);
  const subscriptionId = clean(payload.subscriptionId);
  if (!transactionId || !subscriptionId) {
    throw new HttpError(400, "PayPal transactionId and subscriptionId are required.");
  }

  const transaction = await getTransaction(transactionId);
  if (!transaction) throw new HttpError(404, "Payment transaction was not found.");
  if (transaction.gateway !== "paypal") throw new HttpError(400, "Payment transaction gateway mismatch.");

  const plan = getPlan(transaction.planId);
  const subscription = await getPayPalSubscription(subscriptionId);
  const providerPlanId = stringProp(subscription, "plan_id");
  const providerCustomId = stringProp(subscription, "custom_id");
  const providerStatus = stringProp(subscription, "status").toUpperCase();

  if (providerPlanId !== paypalPlanId(plan)) throw new HttpError(400, "PayPal billing plan mismatch.");
  if (providerCustomId && providerCustomId !== transaction.id) throw new HttpError(400, "PayPal transaction reference mismatch.");
  if (!["APPROVAL_PENDING", "APPROVED", "ACTIVE"].includes(providerStatus)) {
    throw new HttpError(409, `PayPal subscription is not approved. Current status: ${providerStatus || "UNKNOWN"}.`);
  }

  await updateTransaction(transaction.id, {
    Status: providerStatus === "ACTIVE" ? "Complete" : "Approved",
    PaypalSubscriptionId: subscriptionId,
    ProviderReference: subscriptionId,
    RawProviderStatus: JSON.stringify(subscription).slice(0, 2000),
    UpdatedAt: now()
  });

  return {
    ok: true,
    transactionId: transaction.id,
    subscriptionId,
    status: providerStatus,
    entitlementPendingWebhook: true
  };
}

export async function capturePayPalOrder(request: HttpRequest) {
  const payload = await request.json() as { orderId?: string };
  const orderId = clean(payload.orderId);
  if (!orderId) throw new HttpError(400, "PayPal orderId is required.");

  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const result = await jsonRecord(response);
  if (!response.ok) {
    throw new HttpError(response.status, stringProp(result, "message") || "PayPal capture failed.");
  }

  const transaction = await findByPayPalOrderId(orderId);
  if (transaction) {
    await updateTransaction(transaction.id, {
      Status: "Captured",
      RawProviderStatus: JSON.stringify(result).slice(0, 2000),
      UpdatedAt: now()
    });
  }
  return { ok: true, orderId, status: stringProp(result, "status") || "CAPTURE_REQUESTED" };
}

export async function handlePayFastWebhook(request: HttpRequest) {
  const body = await request.text();
  const fields = Object.fromEntries(new URLSearchParams(body).entries());
  if (clean(fields.signature) !== payFastSignature(fields)) {
    throw new HttpError(400, "Invalid PayFast ITN signature.");
  }

  const transaction = await getTransaction(clean(fields.m_payment_id));
  if (!transaction) throw new HttpError(404, "Payment transaction was not found.");
  if (transaction.gateway !== "payfast") throw new HttpError(400, "Payment transaction gateway mismatch.");
  if (transaction.currency !== "ZAR") throw new HttpError(400, "PayFast currency mismatch.");
  if (transaction.amount.toFixed(2) !== Number(fields.amount_gross ?? 0).toFixed(2)) {
    throw new HttpError(400, "PayFast amount mismatch.");
  }
  if (!(await validatePayFastItn(body))) throw new HttpError(400, "PayFast ITN server validation failed.");

  const complete = clean(fields.payment_status).toUpperCase() === "COMPLETE";
  const providerReference = clean(fields.pf_payment_id);
  await updateTransaction(transaction.id, {
    Status: complete ? "Complete" : "Pending",
    ProviderReference: providerReference,
    RawProviderStatus: JSON.stringify(fields).slice(0, 2000),
    UpdatedAt: now()
  });
  if (complete) await upsertEntitlement(transaction, providerReference);
  return { ok: true };
}

export async function handlePayPalWebhook(request: HttpRequest) {
  const body = await request.json() as Record<string, unknown>;
  if (!(await verifyPayPalWebhook(request, body))) throw new HttpError(400, "Invalid PayPal webhook signature.");

  const eventType = stringProp(body, "event_type").toUpperCase();
  const resource = recordProp(body, "resource");
  const subscriptionId = paypalSubscriptionIdFromEvent(eventType, resource);
  const customId = stringProp(resource, "custom_id");

  let transaction = subscriptionId ? await findByPayPalSubscriptionId(subscriptionId) : null;
  if (!transaction && customId) transaction = await getTransaction(customId);
  if (!transaction) return { ok: true, ignored: true };

  const providerPlanId = stringProp(resource, "plan_id");
  if (providerPlanId) {
    const expectedPlanId = paypalPlanId(getPlan(transaction.planId));
    if (providerPlanId !== expectedPlanId) throw new HttpError(400, "PayPal webhook billing plan mismatch.");
  }

  const providerReference = paypalProviderReference(resource, subscriptionId);
  const commonFields = {
    PaypalSubscriptionId: subscriptionId || transaction.paypalSubscriptionId,
    ProviderReference: providerReference,
    RawProviderStatus: JSON.stringify(body).slice(0, 2000),
    UpdatedAt: now()
  };

  if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED" || eventType === "PAYMENT.SALE.COMPLETED") {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Complete" });
    transaction = { ...transaction, paypalSubscriptionId: subscriptionId || transaction.paypalSubscriptionId };
    await upsertEntitlement(transaction, providerReference);
  } else if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Cancelled" });
    await updateEntitlementStatus(transaction.id, "Cancelled", providerReference);
  } else if (eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Cancelled" });
    await updateEntitlementStatus(transaction.id, "Expired", providerReference);
  } else if (eventType === "BILLING.SUBSCRIPTION.SUSPENDED") {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Failed" });
    await updateEntitlementStatus(transaction.id, "Suspended", providerReference);
  } else if (eventType === "PAYMENT.SALE.REFUNDED" || eventType === "PAYMENT.SALE.REVERSED") {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Failed" });
    await updateEntitlementStatus(transaction.id, "Suspended", providerReference);
  } else if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Failed" });
  } else if (
    eventType === "BILLING.SUBSCRIPTION.CREATED" ||
    eventType === "BILLING.SUBSCRIPTION.UPDATED"
  ) {
    await updateTransaction(transaction.id, { ...commonFields, Status: "Approved" });
  } else {
    await updateTransaction(transaction.id, commonFields);
  }

  return { ok: true, eventType, subscriptionId: subscriptionId || undefined };
}

async function readCheckoutInput(request: HttpRequest) {
  return await request.json() as {
    planId?: string;
    gateway?: string;
    customerEmail?: string;
    customerName?: string;
    successUrl?: string;
    cancelUrl?: string;
  };
}

function validateCustomer(emailValue: unknown, nameValue: unknown) {
  const email = clean(emailValue).toLowerCase();
  const name = clean(nameValue);
  if (!email || !email.includes("@")) {
    throw new HttpError(400, "A valid customer email address is required before checkout.");
  }
  return { email, name };
}

async function createPayPalIntent(plan: Plan, email: string, name: string) {
  const providerPlanId = paypalPlanId(plan);
  const transaction = await createTransaction(plan, "paypal", plan.usd, "USD", email, name);
  await updateTransaction(transaction.id, {
    Status: "Pending",
    UpdatedAt: now()
  });
  return {
    gateway: "paypal",
    checkoutMode: "paypal-subscription",
    transactionId: transaction.id,
    paypalPlanId: providerPlanId,
    customerEmail: email,
    customerName: name
  };
}

function getPlan(id = "") {
  const plan = plans.find((item) => item.id === id);
  if (!plan) throw new HttpError(400, "Unknown checkout plan.");
  return plan;
}

function getGateway(value = ""): Gateway {
  if (value === "payfast" || value === "paypal") return value;
  throw new HttpError(400, "Unsupported checkout gateway.");
}

async function createTransaction(plan: Plan, gateway: Gateway, amount: number, currency: string, email: string, name: string) {
  const reference = `SWA-${plan.id.toUpperCase()}-${Date.now()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`.slice(0, 120);
  const item = await createItem("PaymentTransactions", {
    Title: `${plan.name} - ${email}`,
    PlanId: plan.id,
    PlanName: plan.name,
    Gateway: gateway,
    Currency: currency,
    Amount: amount,
    Status: "Created",
    Entitlement: plan.entitlement,
    CustomerEmail: email,
    CustomerName: name,
    MerchantReference: reference,
    ProviderReference: "",
    PaypalOrderId: "",
    PaypalSubscriptionId: "",
    CreatedAt: now(),
    UpdatedAt: now(),
    RawProviderStatus: ""
  });
  return toTransaction(item);
}

async function getTransaction(id: string) {
  if (!id) return null;
  try {
    const item = await getItem("PaymentTransactions", id);
    return toTransaction(item);
  } catch {
    return null;
  }
}

async function findByPayPalOrderId(orderId: string) {
  const result = await listItems("PaymentTransactions", `fields/PaypalOrderId eq '${escapeOData(orderId)}'`);
  return result.value[0] ? toTransaction(result.value[0]) : null;
}

async function findByPayPalSubscriptionId(subscriptionId: string) {
  const result = await listItems("PaymentTransactions", `fields/PaypalSubscriptionId eq '${escapeOData(subscriptionId)}'`);
  return result.value[0] ? toTransaction(result.value[0]) : null;
}

async function updateTransaction(id: string, fields: Record<string, unknown>) {
  return toTransaction(await patchItem("PaymentTransactions", id, fields));
}

async function upsertEntitlement(transaction: Transaction, providerReference: string) {
  const existing = await listItems("Entitlements", `fields/PaymentTransactionId eq '${escapeOData(transaction.id)}'`);
  const validUntil = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

  if (existing.value[0]) {
    return patchItem("Entitlements", existing.value[0].id, {
      Status: "Active",
      ProviderReference: providerReference,
      ValidUntil: validUntil
    });
  }

  return createItem("Entitlements", {
    Title: `${transaction.customerEmail} - ${transaction.entitlement}`,
    CustomerEmail: transaction.customerEmail,
    CustomerName: transaction.customerName,
    PlanId: transaction.planId,
    PlanName: transaction.planName,
    Entitlement: transaction.entitlement,
    Status: "Active",
    PaymentTransactionId: transaction.id,
    ProviderReference: providerReference,
    GrantedAt: now(),
    ValidUntil: validUntil
  });
}

async function updateEntitlementStatus(
  paymentTransactionId: string,
  status: "Suspended" | "Cancelled" | "Expired",
  providerReference: string
) {
  const existing = await listItems("Entitlements", `fields/PaymentTransactionId eq '${escapeOData(paymentTransactionId)}'`);
  if (!existing.value[0]) return null;
  return patchItem("Entitlements", existing.value[0].id, {
    Status: status,
    ProviderReference: providerReference
  });
}

function buildPayFastCheckout(plan: Plan, transaction: Transaction, successUrl: string, cancelUrl: string) {
  requireEnv("PAYFAST_MERCHANT_ID");
  requireEnv("PAYFAST_MERCHANT_KEY");
  const fields: Record<string, string> = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID ?? "",
    merchant_key: process.env.PAYFAST_MERCHANT_KEY ?? "",
    return_url: successUrl,
    cancel_url: cancelUrl,
    notify_url: `${apiBase()}/webhooks/payfast/itn`,
    name_first: transaction.customerName || "Skunkworks Academy Learner",
    email_address: transaction.customerEmail,
    m_payment_id: transaction.id,
    amount: plan.zar.toFixed(2),
    item_name: `Skunkworks Academy ${plan.name}`.slice(0, 100),
    item_description: plan.description.slice(0, 255),
    custom_str1: plan.id,
    custom_str2: plan.entitlement
  };

  if (plan.interval === "month") {
    fields.subscription_type = "1";
    fields.frequency = "3";
    fields.cycles = "0";
  }

  fields.signature = payFastSignature(fields);
  return { action: payFastProcessUrl(), fields };
}

function payFastSignature(fields: Record<string, unknown>) {
  const payload = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, "+")}`)
    .join("&");
  const passphrase = process.env.PAYFAST_PASSPHRASE ? `&passphrase=${encodeURIComponent(process.env.PAYFAST_PASSPHRASE).replace(/%20/g, "+")}` : "";
  return crypto.createHash("md5").update(`${payload}${passphrase}`).digest("hex");
}

async function validatePayFastItn(rawBody: string) {
  if (process.env.PAYFAST_SKIP_SERVER_VALIDATION === "true") return true;
  const response = await fetch(payFastValidateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rawBody
  });
  const text = await response.text();
  return response.ok && text.trim().toUpperCase() === "VALID";
}

async function getPayPalSubscription(subscriptionId: string) {
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const result = await jsonRecord(response);
  if (!response.ok) {
    throw new HttpError(response.status, stringProp(result, "message") || "Unable to verify PayPal subscription.");
  }
  return result;
}

async function paypalAccessToken() {
  requireEnv("PAYPAL_CLIENT_ID");
  requireEnv("PAYPAL_CLIENT_SECRET");
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const result = await jsonRecord(response);
  const accessToken = stringProp(result, "access_token");
  if (!response.ok || !accessToken) throw new HttpError(502, "Unable to acquire PayPal access token.");
  return accessToken;
}

async function verifyPayPalWebhook(request: HttpRequest, body: Record<string, unknown>) {
  requireEnv("PAYPAL_WEBHOOK_ID");
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: request.headers.get("paypal-auth-algo"),
      cert_url: request.headers.get("paypal-cert-url"),
      transmission_id: request.headers.get("paypal-transmission-id"),
      transmission_sig: request.headers.get("paypal-transmission-sig"),
      transmission_time: request.headers.get("paypal-transmission-time"),
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: body
    })
  });
  const result = await jsonRecord(response);
  return response.ok && stringProp(result, "verification_status") === "SUCCESS";
}

function paypalSubscriptionIdFromEvent(eventType: string, resource: Record<string, unknown>) {
  const supplementaryData = recordProp(resource, "supplementary_data");
  const relatedIds = recordProp(supplementaryData, "related_ids");
  return (
    stringProp(resource, "billing_agreement_id") ||
    stringProp(relatedIds, "subscription_id") ||
    stringProp(relatedIds, "billing_agreement_id") ||
    (eventType.startsWith("BILLING.SUBSCRIPTION.") ? stringProp(resource, "id") : "")
  );
}

function paypalProviderReference(resource: Record<string, unknown>, subscriptionId: string) {
  return stringProp(resource, "id") || subscriptionId;
}

function paypalPlanId(plan: Plan, required = true) {
  const value = clean(process.env[plan.paypalPlanEnv]);
  if (!value && required) throw new HttpError(500, `Missing required payment setting: ${plan.paypalPlanEnv}`);
  return value;
}

function toTransaction(item: GraphListItem): Transaction {
  const fields = item.fields;
  return {
    id: item.id,
    planId: stringProp(fields, "PlanId"),
    planName: stringProp(fields, "PlanName"),
    gateway: getGateway(stringProp(fields, "Gateway")),
    currency: stringProp(fields, "Currency"),
    amount: Number(fields.Amount ?? 0),
    entitlement: stringProp(fields, "Entitlement"),
    customerEmail: stringProp(fields, "CustomerEmail"),
    customerName: stringProp(fields, "CustomerName"),
    merchantReference: stringProp(fields, "MerchantReference"),
    paypalOrderId: stringProp(fields, "PaypalOrderId"),
    paypalSubscriptionId: stringProp(fields, "PaypalSubscriptionId")
  };
}

async function jsonRecord(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json() as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordProp(value: unknown, key: string): Record<string, unknown> {
  if (!key) return isRecord(value) ? value : {};
  const nested = isRecord(value) ? value[key] : undefined;
  return isRecord(nested) ? nested : {};
}

function stringProp(value: Record<string, unknown>, key: string) {
  const output = value[key];
  return typeof output === "string" ? output.trim() : "";
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function now() {
  return new Date().toISOString();
}

function escapeOData(value: string) {
  return value.replaceAll("'", "''");
}

function safeUrl(value: unknown, fallback: string) {
  try {
    const url = new URL(clean(value) || fallback);
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function apiBase() {
  return (process.env.PUBLIC_API_BASE_URL ?? productionApiBase).replace(/\/$/, "");
}

function paypalBase() {
  return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function payFastProcessUrl() {
  return process.env.PAYFAST_ENV === "live" ? "https://www.payfast.co.za/eng/process" : "https://sandbox.payfast.co.za/eng/process";
}

function payFastValidateUrl() {
  return process.env.PAYFAST_ENV === "live" ? "https://www.payfast.co.za/eng/query/validate" : "https://sandbox.payfast.co.za/eng/query/validate";
}

function requireEnv(name: string) {
  if (!process.env[name]) throw new HttpError(500, `Missing required payment setting: ${name}`);
}

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  requireSettings(["graphTenantId", "apiClientId", "apiClientSecret"]);
  credential ??= new ClientSecretCredential(config.graphTenantId, config.apiClientId, config.apiClientSecret);
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  if (!token) throw new HttpError(500, "Unable to acquire Microsoft Graph token.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${graphRoot}${path}`, { ...init, headers });
  if (!response.ok) throw new HttpError(response.status, await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function siteId() {
  if (siteIdCache) return siteIdCache;
  const site = await graph<{ id: string }>(`/sites/${config.sharePointHostname}:${config.sharePointSitePath}`);
  siteIdCache = site.id;
  return site.id;
}

async function listId(name: string) {
  const cached = listCache.get(name);
  if (cached) return cached;
  const site = await siteId();
  const result = await graph<{ value: Array<{ id: string; displayName: string }> }>(`/sites/${site}/lists?$select=id,displayName`);
  const list = result.value.find((item) => item.displayName === name);
  if (!list) throw new HttpError(500, `SharePoint list ${name} was not found. Run payment provisioning first.`);
  listCache.set(name, list.id);
  return list.id;
}

async function listItems(name: string, filter?: string) {
  const site = await siteId();
  const list = await listId(name);
  const query = filter ? `&$filter=${encodeURIComponent(filter)}` : "";
  return graph<GraphListResponse>(`/sites/${site}/lists/${list}/items?expand=fields${query}`);
}

async function getItem(name: string, id: string) {
  const site = await siteId();
  const list = await listId(name);
  return graph<GraphListItem>(`/sites/${site}/lists/${list}/items/${id}?expand=fields`);
}

async function createItem(name: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(name);
  return graph<GraphListItem>(`/sites/${site}/lists/${list}/items?expand=fields`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function patchItem(name: string, id: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(name);
  await graph(`/sites/${site}/lists/${list}/items/${id}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
  return graph<GraphListItem>(`/sites/${site}/lists/${list}/items/${id}?expand=fields`);
}

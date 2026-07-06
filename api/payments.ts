import crypto from "node:crypto";
import { ClientSecretCredential } from "@azure/identity";
import type { HttpRequest } from "@azure/functions";
import { config, requireSettings } from "./config.js";
import { HttpError } from "./http.js";

export type PaymentGateway = "payfast" | "paypal";
export type PaymentStatus = "Created" | "Redirected" | "Approved" | "Captured" | "Complete" | "Failed" | "Cancelled" | "Pending";

export interface CheckoutPlan {
  id: string;
  name: string;
  description: string;
  interval: "month" | "once";
  entitlement: string;
  features: string[];
  zar: number;
  usd: number;
}

interface CheckoutSessionInput {
  planId: string;
  gateway: PaymentGateway;
  customerEmail?: string;
  customerName?: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface PaymentTransaction {
  id: string;
  title: string;
  planId: string;
  planName: string;
  gateway: PaymentGateway;
  currency: string;
  amount: number;
  status: PaymentStatus;
  entitlement: string;
  customerEmail: string;
  customerName: string;
  merchantReference: string;
  providerReference: string;
  paypalOrderId: string;
  paypalSubscriptionId: string;
  createdAt: string;
  updatedAt: string;
  rawProviderStatus: string;
}

const graphRoot = "https://graph.microsoft.com/v1.0";
const defaultPortalUrl = "https://portal.skunkworksacademy.com";
const defaultCheckoutUrl = `${defaultPortalUrl}/checkout/`;
let credential: ClientSecretCredential | undefined;
let siteIdCache: string | undefined;
const listIdCache = new Map<string, string>();

export const checkoutPlans: CheckoutPlan[] = [
  {
    id: "starter-monthly",
    name: "Starter",
    description: "Entry-level Academy access for individual learners starting a guided learning path.",
    interval: "month",
    entitlement: "academy.starter",
    zar: 149,
    usd: 9,
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
    features: ["Team learner seat", "Admin reporting", "Cohort tracking", "Partner-ready delivery"]
  }
];

export function publicCheckoutPlans() {
  return checkoutPlans.map((plan) => ({
    ...plan,
    gateways: ["payfast", "paypal"] as PaymentGateway[],
    currencyNote: "PayFast uses ZAR. PayPal uses USD for international checkout."
  }));
}

export async function createCheckoutSession(request: HttpRequest) {
  const input = await request.json() as CheckoutSessionInput;
  const gateway = normaliseGateway(input.gateway);
  const plan = planById(input.planId);
  const customerEmail = cleanText(input.customerEmail).toLowerCase();
  const customerName = cleanText(input.customerName);
  const successUrl = safeUrl(input.successUrl, `${defaultCheckoutUrl}success/`);
  const cancelUrl = safeUrl(input.cancelUrl, `${defaultCheckoutUrl}cancel/`);

  if (!customerEmail || !customerEmail.includes("@")) {
    throw new HttpError(400, "A valid customer email address is required before checkout.");
  }

  const amount = gateway === "payfast" ? plan.zar : plan.usd;
  const currency = gateway === "payfast" ? "ZAR" : "USD";
  const transaction = await createTransaction({ plan, gateway, amount, currency, customerEmail, customerName });

  if (gateway === "payfast") {
    const payfast = buildPayFastCheckout(plan, transaction, successUrl, cancelUrl);
    await updateTransaction(transaction.id, { Status: "Redirected", ProviderReference: transaction.merchantReference });
    return {
      gateway,
      transactionId: transaction.id,
      checkoutMode: "form-post",
      action: payfast.action,
      method: "POST",
      fields: payfast.fields
    };
  }

  const paypal = await createPayPalOrder(plan, transaction, successUrl, cancelUrl);
  await updateTransaction(transaction.id, { Status: "Redirected", PaypalOrderId: paypal.orderId, ProviderReference: paypal.orderId });
  return {
    gateway,
    transactionId: transaction.id,
    checkoutMode: "redirect",
    approvalUrl: paypal.approvalUrl,
    orderId: paypal.orderId
  };
}

export async function capturePayPalOrder(request: HttpRequest) {
  const payload = await request.json() as { orderId?: string };
  const orderId = cleanText(payload.orderId);
  if (!orderId) throw new HttpError(400, "PayPal orderId is required.");

  const token = await paypalAccessToken();
  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, typeof result?.message === "string" ? result.message : "PayPal capture failed.");
  }

  const transaction = await findTransactionByPayPalOrderId(orderId);
  if (transaction) {
    await updateTransaction(transaction.id, {
      Status: "Captured",
      RawProviderStatus: JSON.stringify(result).slice(0, 2000),
      UpdatedAt: new Date().toISOString()
    });
  }

  return { ok: true, orderId, status: result?.status ?? "CAPTURE_REQUESTED" };
}

export async function handlePayFastWebhook(request: HttpRequest) {
  const body = await request.text();
  const params = Object.fromEntries(new URLSearchParams(body).entries());
  const receivedSignature = cleanText(params.signature);
  const calculatedSignature = payFastSignature(params);

  if (!receivedSignature || receivedSignature !== calculatedSignature) {
    throw new HttpError(400, "Invalid PayFast ITN signature.");
  }

  const transactionId = cleanText(params.m_payment_id);
  const paymentStatus = cleanText(params.payment_status);
  const amountGross = Number(params.amount_gross ?? 0);
  const transaction = await getTransaction(transactionId);

  if (!transaction) throw new HttpError(404, "Payment transaction was not found.");
  if (transaction.gateway !== "payfast") throw new HttpError(400, "Payment transaction gateway mismatch.");
  if (Number(transaction.amount).toFixed(2) !== amountGross.toFixed(2)) throw new HttpError(400, "PayFast amount mismatch.");
  if (transaction.currency !== "ZAR") throw new HttpError(400, "PayFast currency mismatch.");

  const verified = await validatePayFastItn(body);
  if (!verified) throw new HttpError(400, "PayFast ITN server validation failed.");

  const complete = paymentStatus.toUpperCase() === "COMPLETE";
  await updateTransaction(transaction.id, {
    Status: complete ? "Complete" : "Pending",
    ProviderReference: cleanText(params.pf_payment_id),
    RawProviderStatus: JSON.stringify(params).slice(0, 2000),
    UpdatedAt: new Date().toISOString()
  });

  if (complete) await grantEntitlement(transaction, cleanText(params.pf_payment_id));
  return { ok: true };
}

export async function handlePayPalWebhook(request: HttpRequest) {
  const payload = await request.json() as Record<string, unknown>;
  const verified = await verifyPayPalWebhook(request, payload);
  if (!verified) throw new HttpError(400, "Invalid PayPal webhook signature.");

  const eventType = cleanText(payload.event_type);
  const resource = payload.resource as Record<string, unknown> | undefined;
  const related = resource?.supplementary_data as Record<string, unknown> | undefined;
  const relatedIds = related?.related_ids as Record<string, unknown> | undefined;
  const orderId = cleanText(relatedIds?.order_id) || cleanText(resource?.id);
  const captureId = cleanText(resource?.id);

  if (!orderId) return { ok: true, ignored: true, reason: "No PayPal order id on webhook." };

  const transaction = await findTransactionByPayPalOrderId(orderId);
  if (!transaction) return { ok: true, ignored: true, reason: "No matching local transaction." };

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    await updateTransaction(transaction.id, {
      Status: "Complete",
      ProviderReference: captureId || orderId,
      RawProviderStatus: JSON.stringify(payload).slice(0, 2000),
      UpdatedAt: new Date().toISOString()
    });
    await grantEntitlement(transaction, captureId || orderId);
  } else if (eventType.includes("DENIED") || eventType.includes("FAILED") || eventType.includes("CANCELLED")) {
    await updateTransaction(transaction.id, {
      Status: "Failed",
      RawProviderStatus: JSON.stringify(payload).slice(0, 2000),
      UpdatedAt: new Date().toISOString()
    });
  }

  return { ok: true };
}

function planById(planId: string) {
  const plan = checkoutPlans.find((item) => item.id === planId);
  if (!plan) throw new HttpError(400, "Unknown checkout plan.");
  return plan;
}

function normaliseGateway(gateway: string): PaymentGateway {
  if (gateway === "payfast" || gateway === "paypal") return gateway;
  throw new HttpError(400, "Unsupported checkout gateway.");
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function safeUrl(value: unknown, fallback: string) {
  try {
    const url = new URL(cleanText(value) || fallback);
    if (!["https:", "http:"].includes(url.protocol)) return fallback;
    return url.href;
  } catch {
    return fallback;
  }
}

function merchantReference(plan: CheckoutPlan) {
  const entropy = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `SWA-${plan.id.toUpperCase()}-${Date.now()}-${entropy}`.slice(0, 120);
}

async function createTransaction(input: { plan: CheckoutPlan; gateway: PaymentGateway; amount: number; currency: string; customerEmail: string; customerName: string }): Promise<PaymentTransaction> {
  const now = new Date().toISOString();
  const item = await createItem("PaymentTransactions", {
    Title: `${input.plan.name} - ${input.customerEmail}`,
    PlanId: input.plan.id,
    PlanName: input.plan.name,
    Gateway: input.gateway,
    Currency: input.currency,
    Amount: input.amount,
    Status: "Created",
    Entitlement: input.plan.entitlement,
    CustomerEmail: input.customerEmail,
    CustomerName: input.customerName,
    MerchantReference: merchantReference(input.plan),
    ProviderReference: "",
    PaypalOrderId: "",
    PaypalSubscriptionId: "",
    CreatedAt: now,
    UpdatedAt: now,
    RawProviderStatus: ""
  });
  return toTransaction(item);
}

async function getTransaction(id: string) {
  if (!id) return null;
  const result = await listItems("PaymentTransactions", `id eq '${escapeOData(id)}'`);
  return result.value[0] ? toTransaction(result.value[0]) : null;
}

async function findTransactionByPayPalOrderId(orderId: string) {
  const result = await listItems("PaymentTransactions", `fields/PaypalOrderId eq '${escapeOData(orderId)}'`);
  return result.value[0] ? toTransaction(result.value[0]) : null;
}

async function updateTransaction(id: string, fields: Record<string, unknown>) {
  return toTransaction(await patchItem("PaymentTransactions", id, fields));
}

async function grantEntitlement(transaction: PaymentTransaction, providerReference: string) {
  const existing = await listItems("Entitlements", `fields/PaymentTransactionId eq '${escapeOData(transaction.id)}'`);
  if (existing.value[0]) return existing.value[0];

  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();
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
    GrantedAt: now,
    ValidUntil: validUntil
  });
}

function toTransaction(item: { id: string; fields: Record<string, unknown> }): PaymentTransaction {
  const fields = item.fields;
  return {
    id: item.id,
    title: text(fields.Title),
    planId: text(fields.PlanId),
    planName: text(fields.PlanName),
    gateway: text(fields.Gateway) as PaymentGateway,
    currency: text(fields.Currency),
    amount: Number(fields.Amount ?? 0),
    status: text(fields.Status) as PaymentStatus,
    entitlement: text(fields.Entitlement),
    customerEmail: text(fields.CustomerEmail),
    customerName: text(fields.CustomerName),
    merchantReference: text(fields.MerchantReference),
    providerReference: text(fields.ProviderReference),
    paypalOrderId: text(fields.PaypalOrderId),
    paypalSubscriptionId: text(fields.PaypalSubscriptionId),
    createdAt: text(fields.CreatedAt),
    updatedAt: text(fields.UpdatedAt),
    rawProviderStatus: text(fields.RawProviderStatus)
  };
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function buildPayFastCheckout(plan: CheckoutPlan, transaction: PaymentTransaction, successUrl: string, cancelUrl: string) {
  requireSetting("PAYFAST_MERCHANT_ID");
  requireSetting("PAYFAST_MERCHANT_KEY");
  const fields: Record<string, string> = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID ?? "",
    merchant_key: process.env.PAYFAST_MERCHANT_KEY ?? "",
    return_url: successUrl,
    cancel_url: cancelUrl,
    notify_url: `${apiPublicBase()}/payfast/itn`,
    name_first: transaction.customerName || "Skunkworks Academy Learner",
    email_address: transaction.customerEmail,
    m_payment_id: transaction.id,
    amount: plan.zar.toFixed(2),
    item_name: `Skunkworks Academy ${plan.name}`.slice(0, 100),
    item_description: plan.description.slice(0, 255),
    custom_str1: plan.id,
    custom_str2: plan.entitlement,
    subscription_type: plan.interval === "month" ? "1" : "0",
    frequency: plan.interval === "month" ? "3" : "",
    cycles: plan.interval === "month" ? "0" : ""
  };
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

async function createPayPalOrder(plan: CheckoutPlan, transaction: PaymentTransaction, successUrl: string, cancelUrl: string) {
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: transaction.id,
          custom_id: transaction.id,
          description: `Skunkworks Academy ${plan.name}`,
          amount: {
            currency_code: "USD",
            value: plan.usd.toFixed(2)
          }
        }
      ],
      application_context: {
        brand_name: "Skunkworks Academy",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: `${successUrl}?provider=paypal&orderId={orderId}`.replace("{orderId}", ""),
        cancel_url: cancelUrl
      }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, typeof result?.message === "string" ? result.message : "PayPal order creation failed.");
  const approvalUrl = Array.isArray(result.links) ? result.links.find((link: { rel: string }) => link.rel === "approve")?.href : "";
  if (!approvalUrl) throw new HttpError(502, "PayPal did not return an approval URL.");
  return { orderId: String(result.id), approvalUrl };
}

async function verifyPayPalWebhook(request: HttpRequest, body: Record<string, unknown>) {
  requireSetting("PAYPAL_WEBHOOK_ID");
  const token = await paypalAccessToken();
  const payload = {
    auth_algo: request.headers.get("paypal-auth-algo"),
    cert_url: request.headers.get("paypal-cert-url"),
    transmission_id: request.headers.get("paypal-transmission-id"),
    transmission_sig: request.headers.get("paypal-transmission-sig"),
    transmission_time: request.headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: body
  };

  const response = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.verification_status === "SUCCESS";
}

async function paypalAccessToken() {
  requireSetting("PAYPAL_CLIENT_ID");
  requireSetting("PAYPAL_CLIENT_SECRET");
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new HttpError(502, "Unable to acquire PayPal access token.");
  return String(result.access_token);
}

function paypalApiBase() {
  return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function payFastProcessUrl() {
  return process.env.PAYFAST_ENV === "live" ? "https://www.payfast.co.za/eng/process" : "https://sandbox.payfast.co.za/eng/process";
}

function payFastValidateUrl() {
  return process.env.PAYFAST_ENV === "live" ? "https://www.payfast.co.za/eng/query/validate" : "https://sandbox.payfast.co.za/eng/query/validate";
}

function apiPublicBase() {
  return (process.env.PUBLIC_API_BASE_URL ?? "https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api").replace(/\/$/, "");
}

function requireSetting(name: string) {
  if (!process.env[name]) throw new HttpError(500, `Missing required payment setting: ${name}`);
}

function escapeOData(value: string) {
  return value.replaceAll("'", "''");
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
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, body || `Graph request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function siteId() {
  requireSettings(["sharePointHostname", "sharePointSitePath"]);
  if (siteIdCache) return siteIdCache;
  const site = await graph<{ id: string }>(`/sites/${config.sharePointHostname}:${config.sharePointSitePath}`);
  siteIdCache = site.id;
  return site.id;
}

async function listId(displayName: string) {
  const cached = listIdCache.get(displayName);
  if (cached) return cached;
  const site = await siteId();
  const result = await graph<{ value: Array<{ id: string; displayName: string }> }>(`/sites/${site}/lists?$select=id,displayName`);
  const list = result.value.find((item) => item.displayName === displayName);
  if (!list) throw new HttpError(500, `SharePoint list ${displayName} was not found. Run payment provisioning first.`);
  listIdCache.set(displayName, list.id);
  return list.id;
}

async function listItems(listName: string, filter?: string) {
  const site = await siteId();
  const list = await listId(listName);
  const query = filter ? `&$filter=${encodeURIComponent(filter)}` : "";
  return graph<{ value: Array<{ id: string; fields: Record<string, unknown> }> }>(`/sites/${site}/lists/${list}/items?expand=fields${query}`);
}

async function createItem(listName: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(listName);
  return graph<{ id: string; fields: Record<string, unknown> }>(`/sites/${site}/lists/${list}/items?expand=fields`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function patchItem(listName: string, id: string, fields: Record<string, unknown>) {
  const site = await siteId();
  const list = await listId(listName);
  await graph(`/sites/${site}/lists/${list}/items/${id}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
  return graph<{ id: string; fields: Record<string, unknown> }>(`/sites/${site}/lists/${list}/items/${id}?expand=fields`);
}

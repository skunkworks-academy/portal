import { createHash } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { requireAdmin } from "./auth.js";
import { HttpError } from "./http.js";
import { CosmosLmsStore } from "./lmsCosmosStore.js";

export const contactTopics = ["training", "support", "business", "editorial", "privacy", "legal", "general"] as const;
export type ContactRecord = { id: string; name: string; email: string; topic: string; message: string; createdAt: string; status: "new"; digest: string };
const origins = new Set(["https://www.skunkworksacademy.com", "https://skunkworksacademy.com", "https://portal.skunkworksacademy.com"]);
const collection = "contact-enquiries-v1";
const credential = new DefaultAzureCredential();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function storage() {
  const e = process.env;
  if (!e.LMS_COSMOS_ENDPOINT || !e.LMS_COSMOS_DATABASE || !e.LMS_COSMOS_CONTAINER || !e.LMS_HOME_ORGANIZATION_ID) throw new HttpError(503, "Enquiry storage unavailable.");
  return new CosmosLmsStore(e.LMS_COSMOS_ENDPOINT, e.LMS_COSMOS_DATABASE, e.LMS_COSMOS_CONTAINER, async () => (await credential.getToken("https://cosmos.azure.com/.default")).token);
}
type Store = Pick<CosmosLmsStore, "get" | "put" | "getWithEtag" | "putIfMatch" | "list">;
export function validateContact(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Complete the enquiry form.");
  const v = value as Record<string, unknown>;
  if (v.website) throw new HttpError(400, "Unable to accept this enquiry.");
  for (const [field, min, max] of [["name", 1, 100], ["email", 3, 254], ["message", 10, 5000]] as const) {
    if (typeof v[field] !== "string" || v[field].trim().length < min || v[field].trim().length > max) throw new HttpError(400, `Check your ${field}.`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email as string)) throw new HttpError(400, "Enter a valid reply email.");
  if (!contactTopics.includes(v.topic as typeof contactTopics[number])) throw new HttpError(400, "Choose an enquiry topic.");
  if (typeof v.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)) throw new HttpError(400, "Reload the form before sending.");
  return { id: v.id, name: (v.name as string).trim(), email: (v.email as string).trim().toLowerCase(), topic: v.topic as string, message: (v.message as string).trim() };
}
export function createContactHandlers(deps: { store: () => Store; organization: () => string; authenticate: typeof requireAdmin; now: () => Date } = {
  store: storage, organization: () => process.env.LMS_HOME_ORGANIZATION_ID || "", authenticate: requireAdmin, now: () => new Date()
}) {
  function reply(request: HttpRequest, status: number, body: unknown): HttpResponseInit {
    const origin = request.headers.get("origin") || "";
    return { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin", ...(origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}) }, jsonBody: body };
  }
  function failed(request: HttpRequest, error: unknown) {
    const status = error instanceof HttpError ? error.status : 503;
    return reply(request, status, { error: status >= 500 ? "We could not confirm receipt. Your message is still in the form. Please retry." : error instanceof Error ? error.message : "Unable to accept this enquiry." });
  }
  // Durable, optimistic-concurrency counters bound writes across Function instances.
  async function limit(store: Store, key: string, maximum: number) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await store.getWithEtag<{ count: number }>("contact-limits-v1", key);
      if ((existing?.value.count || 0) >= maximum) throw new HttpError(429, "Too many enquiries. Please wait an hour and retry, or use email.");
      try {
        if (existing) await store.putIfMatch("contact-limits-v1", key, { count: existing.value.count + 1 }, existing.etag);
        else await store.put("contact-limits-v1", key, { count: 1 }, { ifAbsent: true });
        return;
      } catch (error) { if (!(error instanceof HttpError) || error.status !== 409) throw error; }
    }
    throw new HttpError(503, "Please retry.");
  }
  const submit = async (request: HttpRequest) => {
    try {
      if (!origins.has(request.headers.get("origin") || "")) throw new HttpError(403, "Use the Academy contact page.");
      if (request.method === "OPTIONS") return { ...reply(request, 204, undefined), headers: { ...reply(request, 204, undefined).headers, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "content-type" } };
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "JSON required.");
      const raw = await request.text();
      if (raw.length > 24000) throw new HttpError(413, "Enquiry too long.");
      let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, "Invalid enquiry."); }
      const input = validateContact(parsed), store = deps.store(), org = deps.organization();
      if (!org) throw new HttpError(503, "Enquiry storage unavailable.");
      const key = `${org}:${input.id}`, digest = hash(JSON.stringify(input));
      const existing = await store.get<ContactRecord>(collection, key);
      if (existing) {
        if (existing.digest !== digest) throw new HttpError(409, "This reference is already used. Edit your message and send again.");
        return reply(request, 200, { received: true, reference: input.id });
      }
      const hour = deps.now().toISOString().slice(0, 13);
      await limit(store, `${org}:${hour}:all`, 200);
      await limit(store, `${org}:${hour}:${hash(input.email)}`, 5);
      const record: ContactRecord = { ...input, digest, createdAt: deps.now().toISOString(), status: "new" };
      try { await store.put(collection, key, record, { ifAbsent: true, ttl: -1 }); }
      catch (error) { if (!(error instanceof HttpError) || error.status !== 409) throw error; }
      const saved = await store.get<ContactRecord>(collection, key);
      if (saved?.digest !== digest) throw new HttpError(503, "Receipt could not be verified.");
      return reply(request, 201, { received: true, reference: input.id });
    } catch (error) { return failed(request, error); }
  };
  const inbox = async (request: HttpRequest) => {
    try {
      await deps.authenticate(request);
      const org = deps.organization();
      if (!org) throw new HttpError(503, "Enquiry storage unavailable.");
      const records = await deps.store().list<ContactRecord>(collection, `${org}:`);
      return reply(request, 200, records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ digest: _digest, ...record }) => record));
    } catch (error) { return failed(request, error); }
  };
  return { submit, inbox };
}
const handlers = createContactHandlers();
app.http("contactSubmit", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "contact/enquiries", handler: handlers.submit });
app.http("contactInbox", { methods: ["GET"], authLevel: "anonymous", route: "staff/contact-enquiries", handler: handlers.inbox });

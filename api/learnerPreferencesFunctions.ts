import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest } from "@azure/functions";
import { requireUser } from "./auth.js";
import { CosmosLmsStore } from "./lmsCosmosStore.js";
import { empty, failure, HttpError, json, readJson } from "./http.js";

const credential = new DefaultAzureCredential();
const collection = "learner-preferences-v1";

/** The API, not the browser, derives learner/organisation ownership from the verified Entra token. */
async function context(request: HttpRequest) {
  const user = await requireUser(request);
  const tenant = (process.env.ENTRA_TENANT_ID ?? "").toLowerCase();
  if (!tenant || user.tenantId?.toLowerCase() !== tenant) {
    throw new HttpError(403, "Academy learner membership is not provisioned.");
  }
  const organizationId = process.env.LMS_HOME_ORGANIZATION_ID;
  if (!organizationId) throw new HttpError(503, "Learner preference storage is not configured.");
  const endpoint = process.env.LMS_COSMOS_ENDPOINT;
  const database = process.env.LMS_COSMOS_DATABASE;
  const container = process.env.LMS_COSMOS_CONTAINER;
  if (!endpoint || !database || !container) throw new HttpError(503, "Learner preference storage is not configured.");
  const store = new CosmosLmsStore(endpoint, database, container, async () =>
    (await credential.getToken("https://cosmos.azure.com/.default")).token);
  return { store, key: organizationId + ":" + user.subject };
}

/** Strict schema: reject arbitrary HTML, theme tokens, and private note fields. */
export function validatePreferences(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid learner preferences.");
  const p = input as Record<string, unknown>;
  const allow = (key: string, values: readonly unknown[]) => values.includes(p[key]);
  if (p.version !== 1 ||
      !allow("focus", ["cloud", "cybersecurity", "ai", "it", "exploring"]) ||
      !allow("goal", ["certification", "career", "skills", "exploration"]) ||
      !allow("format", ["practice", "visual", "reading", "guided"]) ||
      !allow("pace", ["15", "30", "60"]) ||
      !allow("palette", ["navy", "teal", "amber", "contrast"]) ||
      !allow("textSize", ["standard", "large"]) ||
      !allow("confidence", [1, 2, 3]) ||
      typeof p.reduceMotion !== "boolean") throw new HttpError(400, "Invalid learner preference choice.");
  return {
    version: 1, focus: p.focus, goal: p.goal, format: p.format,
    pace: p.pace, palette: p.palette, textSize: p.textSize,
    reduceMotion: p.reduceMotion, confidence: p.confidence
  };
}

app.http("learnerPreferencesGet", {
  methods: ["GET"], authLevel: "anonymous", route: "learner/preferences",
  handler: async (request) => {
    try {
      const { store, key } = await context(request);
      return json(request, await store.get(collection, key));
    } catch (error) { return failure(request, error); }
  }
});
app.http("learnerPreferencesSave", {
  methods: ["PUT"], authLevel: "anonymous", route: "learner/preferences",
  handler: async (request) => {
    try {
      const { store, key } = await context(request);
      const preferences = validatePreferences(await readJson<unknown>(request));
      await store.put(collection, key, preferences);
      return json(request, preferences);
    } catch (error) { return failure(request, error); }
  }
});
app.http("learnerPreferencesDelete", {
  methods: ["DELETE"], authLevel: "anonymous", route: "learner/preferences",
  handler: async (request) => {
    try {
      const { store, key } = await context(request);
      await store.delete(collection, key);
      return empty(request);
    } catch (error) { return failure(request, error); }
  }
});

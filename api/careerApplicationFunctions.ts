import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest } from "@azure/functions";
import { requireUser } from "./auth.js";
import { CosmosLmsStore } from "./lmsCosmosStore.js";
import { empty, failure, HttpError, json, readJson } from "./http.js";
import { validateCareerCreate, validateCareerId, validateCareerStatus, type CareerApplication } from "./careerApplicationDomain.js";

const collection = "career-applications-v1";
const credential = new DefaultAzureCredential();

/** Server-side token validation and record-key derivation: clients never select a user's partition. */
async function careerContext(request: HttpRequest) {
  const principal = await requireUser(request);
  const organization = process.env.LMS_HOME_ORGANIZATION_ID;
  const endpoint = process.env.LMS_COSMOS_ENDPOINT;
  const database = process.env.LMS_COSMOS_DATABASE;
  const container = process.env.LMS_COSMOS_CONTAINER;
  if (!organization || !endpoint || !database || !container) {
    throw new HttpError(503, "Career application storage is not configured.");
  }
  const store = new CosmosLmsStore(endpoint, database, container, async () =>
    (await credential.getToken("https://cosmos.azure.com/.default")).token);
  // Subject is already validated and tenant-namespaced by requireUser.
  const ownerPrefix = organization + ":" + principal.subject + ":";
  return { store, ownerPrefix };
}

app.http("careerApplicationsList", {
  methods: ["GET"], authLevel: "anonymous", route: "me/career/applications",
  handler: async request => {
    try {
      const { store, ownerPrefix } = await careerContext(request);
      const items = await store.list<CareerApplication>(collection, ownerPrefix);
      return json(request, items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (error) { return failure(request, error); }
  }
});

app.http("careerApplicationsCreate", {
  methods: ["POST"], authLevel: "anonymous", route: "me/career/applications",
  handler: async request => {
    try {
      const { store, ownerPrefix } = await careerContext(request);
      const input = validateCareerCreate(await readJson<unknown>(request));
      const existing = await store.list<CareerApplication>(collection, ownerPrefix);
      if (existing.length >= 100) throw new HttpError(409, "The 100-application tracker limit has been reached.");
      const now = new Date().toISOString();
      const record: CareerApplication = { id: randomUUID(), ...input, status: "Saved", createdAt: now, updatedAt: now };
      await store.put(collection, ownerPrefix + record.id, record, { ifAbsent: true });
      // This records an opportunity; it does NOT submit an application to an employer.
      return json(request, record, 201);
    } catch (error) { return failure(request, error); }
  }
});

app.http("careerApplicationsUpdate", {
  methods: ["PATCH"], authLevel: "anonymous", route: "me/career/applications/{id}",
  handler: async request => {
    try {
      const { store, ownerPrefix } = await careerContext(request);
      const key = ownerPrefix + validateCareerId(request.params.id);
      const status = validateCareerStatus(await readJson<unknown>(request));
      const current = await store.getWithEtag<CareerApplication>(collection, key);
      if (!current) throw new HttpError(404, "Career application not found.");
      const record = { ...current.value, status, updatedAt: new Date().toISOString() };
      await store.putIfMatch(collection, key, record, current.etag);
      return json(request, record);
    } catch (error) { return failure(request, error); }
  }
});

app.http("careerApplicationsDelete", {
  methods: ["DELETE"], authLevel: "anonymous", route: "me/career/applications/{id}",
  handler: async request => {
    try {
      const { store, ownerPrefix } = await careerContext(request);
      await store.delete(collection, ownerPrefix + validateCareerId(request.params.id));
      return empty(request);
    } catch (error) { return failure(request, error); }
  }
});

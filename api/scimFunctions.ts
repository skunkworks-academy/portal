import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { CosmosLmsStore } from "./lmsCosmosStore.js";
import { issueScimToken, scimConfig, verifyScimToken } from "./scimAuth.js";
import { GROUP_SCHEMA, LIST_SCHEMA, ScimError, ScimService, USER_SCHEMA } from "./scimDomain.js";

const identity = new DefaultAzureCredential();
const noStore = {
  "Cache-Control": "no-store, private", "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff"
};
function response(body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponseInit {
  return { status, headers: { ...noStore, "Content-Type": "application/scim+json; charset=utf-8", ...headers }, jsonBody: body };
}
function fail(error: unknown, ctx: InvocationContext): HttpResponseInit {
  const status = error instanceof ScimError ? error.status : 503;
  const detail = status >= 500 ? "SCIM service unavailable." : error instanceof Error ? error.message : "Request failed.";
  if (status >= 500) ctx.error("SCIM request failed (credentials, payload and PII redacted).", { status });
  return response({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail,
    ...(error instanceof ScimError && error.scimType ? { scimType: error.scimType } : {}) }, status,
  status === 401 ? { "WWW-Authenticate": 'Bearer realm="Skunkworks Academy SCIM"' } : {});
}
async function body(request: HttpRequest): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > 65536) throw new ScimError(413, "SCIM payload exceeds 64 KB.");
  try { return JSON.parse(raw) as unknown; }
  catch { throw new ScimError(400, "Expected a JSON SCIM payload.", "invalidSyntax"); }
}
function count(query: URLSearchParams, key: string, fallback: number): number {
  const raw = query.get(key);
  if (raw === null) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new ScimError(400, "Invalid " + key + " query parameter.", "invalidValue");
  return Number(raw);
}
function store(): CosmosLmsStore {
  const endpoint = process.env.LMS_COSMOS_ENDPOINT;
  const database = process.env.LMS_COSMOS_DATABASE;
  const container = process.env.LMS_COSMOS_CONTAINER;
  if (!endpoint || !database || !container) throw new ScimError(503, "SCIM storage unavailable.");
  return new CosmosLmsStore(endpoint, database, container,
    async () => (await identity.getToken("https://cosmos.azure.com/.default")).token);
}
function attr(name: string, type: string, required = false, multiValued = false) {
  return { name, type, multiValued, required, caseExact: false,
    mutability: "readWrite", returned: "default", uniqueness: name === "userName" || name === "displayName" ? "server" : "none" };
}
const schemaResources = [
  { schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"], id: USER_SCHEMA, name: "User",
    description: "Academy identity", attributes: [
      attr("userName", "string", true), attr("externalId", "string"), attr("displayName", "string"),
      { ...attr("name", "complex"), subAttributes: [attr("givenName", "string"), attr("familyName", "string"), attr("formatted", "string")] },
      { ...attr("emails", "complex", false, true), subAttributes: [attr("value", "string"), attr("type", "string"), attr("primary", "boolean")] },
      attr("active", "boolean")
    ] },
  { schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"], id: GROUP_SCHEMA, name: "Group",
    description: "Academy SCIM group (does not grant privileged Portal roles)", attributes: [
      attr("displayName", "string", true), attr("externalId", "string"),
      { ...attr("members", "complex", false, true), subAttributes: [attr("value", "string"), attr("type", "string")] }
    ] }
];
function listResponse(items: unknown[]) {
  return { schemas: [LIST_SCHEMA], totalResults: items.length, startIndex: 1, itemsPerPage: items.length, Resources: items };
}
function discovery(kind: string, id: string | undefined, base: string) {
  if (kind === "Schemas") {
    const found = id ? schemaResources.filter(s => s.id === id) : schemaResources;
    if (!found.length) throw new ScimError(404, "Schema not found.");
    return id ? found[0] : listResponse(found);
  }
  if (id) throw new ScimError(404, "Resource not found.");
  if (kind === "ResourceTypes") return listResponse([
    { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "User",
      name: "User", endpoint: "/Users", schema: USER_SCHEMA, meta: { location: base + "/ResourceTypes/User", resourceType: "ResourceType" } },
    { schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "Group",
      name: "Group", endpoint: "/Groups", schema: GROUP_SCHEMA, meta: { location: base + "/ResourceTypes/Group", resourceType: "ResourceType" } }
  ]);
  if (kind === "ServiceProviderConfig") return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true }, bulk: { supported: false }, filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
    authenticationSchemes: [{ type: "oauthbearertoken", name: "OAuth 2.0 bearer token", description: "Short-lived tenant-scoped OAuth 2.0 client credentials access token", primary: true }],
    meta: { location: base + "/ServiceProviderConfig", resourceType: "ServiceProviderConfig" }
  };
  throw new ScimError(404, "Unknown SCIM resource.");
}
app.http("scimOAuthToken", {
  route: "scim/token", methods: ["POST"], authLevel: "anonymous",
  handler: async (request, ctx) => {
    try {
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded"))
        throw new ScimError(415, "OAuth token request must use application/x-www-form-urlencoded.");
      const raw = await request.text();
      if (raw.length > 8192) throw new ScimError(413, "OAuth request is too large.");
      const fields = new URLSearchParams(raw);
      if (fields.get("grant_type") !== "client_credentials") throw new ScimError(400, "Unsupported OAuth grant type.");
      if (fields.get("scope") && fields.get("scope") !== "scim.provision") throw new ScimError(400, "Unsupported OAuth scope.");
      const result = await issueScimToken(fields.get("client_id") ?? "", fields.get("client_secret") ?? "");
      return { status: 200, headers: { ...noStore, "Content-Type": "application/json" }, jsonBody: result };
    } catch (error) {
      const errorResponse = fail(error, ctx);
      return { ...errorResponse, headers: { ...errorResponse.headers, "Content-Type": "application/json" } };
    }
  }
});
app.http("scimResources", {
  route: "scim/v2/{kind}/{id?}", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  authLevel: "anonymous",
  handler: async (request, ctx) => {
    try {
      // Verify caller before any discovery or data read. SCIM routes never use the
      // browser's delegated Portal access_as_user scope or its MSAL tokens.
      const principal = await verifyScimToken(request.headers.get("authorization"));
      const base = scimConfig().base;
      const kind = request.params.kind;
      const id = request.params.id;
      if (kind !== "Users" && kind !== "Groups") {
        if (request.method !== "GET") throw new ScimError(405, "Read-only discovery resource.");
        return response(discovery(kind, id, base));
      }
      const resourceKind = kind as "Users" | "Groups";
      const service = new ScimService(store(), principal.organizationId, base);
      const excludeMembers = request.query.get("excludedAttributes")?.toLowerCase() === "members";
      if (request.method === "GET") {
        if (id) return response(await service.get(resourceKind, id, excludeMembers));
        return response(await service.list(resourceKind, request.query.get("filter"),
          count(request.query, "startIndex", 1), count(request.query, "count", 100), excludeMembers));
      }
      if (request.method === "POST") {
        if (id) throw new ScimError(405, "Cannot create at a resource URL.");
        const created = await service.create(resourceKind, await body(request));
        return response(created, 201, { Location: base + "/" + kind + "/" + (created as { id: string }).id });
      }
      if (!id) throw new ScimError(405, "Resource identifier required.");
      if (request.method === "DELETE") {
        await service.remove(resourceKind, id);
        return { status: 204, headers: noStore };
      }
      if (request.method === "PUT") return response(await service.replace(resourceKind, id, await body(request)));
      if (request.method === "PATCH") {
        const updated = await service.patch(resourceKind, id, await body(request));
        return kind === "Groups" ? { status: 204, headers: noStore } : response(updated);
      }
      throw new ScimError(405, "Unsupported SCIM method.");
    } catch (error) { return fail(error, ctx); }
  }
});

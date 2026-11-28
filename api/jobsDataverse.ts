import { ClientSecretCredential, ManagedIdentityCredential } from "@azure/identity";
import { HttpError } from "./http.js";

export type Table = "jobprofile" | "jobvacancy" | "jobentry";
export type Row = Record<string, unknown>;
type Metadata = { EntitySetName: string; PrimaryIdAttribute: string; ManyToOneRelationships?: Array<{ ReferencingAttribute: string; ReferencingEntityNavigationPropertyName: string }> };
type TokenSource = (scope: string) => Promise<{ token: string }>;
const unavailable = () => new HttpError(503, "The jobs database is unavailable. Please try again later.");

const dynamicsOrigin = "https://sw.crm14.dynamics.com";
const dynamicsTenant = "972e8de4-e365-43a3-99ec-c86a0cc249e8";
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export class JobsSetupRequired extends HttpError {
  constructor() { super(503, "The Academy is connecting its Jobs database."); }
}

export function jobsConnection(env: NodeJS.ProcessEnv) {
  const origin = (env.JOBS_DATAVERSE_URL || dynamicsOrigin).replace(/\/$/, "");
  const prefix = env.JOBS_DATAVERSE_PREFIX || "";
  if (origin !== dynamicsOrigin || !/^[a-z][a-z0-9]{0,7}$/.test(prefix)) throw new JobsSetupRequired();
  const clientId = env.JOBS_DATAVERSE_CLIENT_ID;
  const secret = env.JOBS_DATAVERSE_CLIENT_SECRET;
  if (clientId || secret) {
    if (!clientId || !uuid.test(clientId) || !secret || secret.startsWith("@Microsoft.KeyVault(")) throw new JobsSetupRequired();
    return { origin, prefix, credential: new ClientSecretCredential(dynamicsTenant, clientId, secret) };
  }
  if (env.JOBS_HOST_TENANT_ID?.toLowerCase() !== dynamicsTenant) throw new JobsSetupRequired();
  return { origin, prefix, credential: new ManagedIdentityCredential() };
}

export class JobsDataverse {
  private readonly metadata = new Map<Table, Promise<Metadata>>();
  readonly root: string;
  constructor(readonly origin: string, readonly prefix: string, private token: TokenSource, private send: typeof fetch = fetch) {
    if (!/^https:\/\/[a-z0-9-]+\.crm\d*\.dynamics\.com$/.test(origin) || !/^[a-z][a-z0-9]{0,7}$/.test(prefix)) throw unavailable();
    this.root = origin + "/api/data/v9.2/";
  }
  col(name: string) { return this.prefix + "_" + name; }
  lookup(name: string) { return "_" + this.col(name) + "_value"; }

  private async call(url: string, init: RequestInit = {}) {
    const location = new URL(url, this.root);
    if (location.origin !== this.origin || !location.pathname.startsWith("/api/data/v9.2/")) throw unavailable();
    let response: Response;
    try {
      const credential = await this.token(this.origin + "/.default");
      response = await this.send(location, { ...init, redirect: "error", signal: AbortSignal.timeout(15000), headers: {
        Authorization: "Bearer " + credential.token, Accept: "application/json", "OData-Version": "4.0",
        "OData-MaxVersion": "4.0", "Content-Type": "application/json", ...init.headers
      } });
    } catch { throw unavailable(); }
    if (response.status === 412) throw new HttpError(409, "This record has changed. Refresh and try again.");
    if (response.status === 404) throw new HttpError(404, "Record not found.");
    if (!response.ok) throw unavailable();
    return response;
  }
  async describe(table: Table): Promise<Metadata> {
    const cached = this.metadata.get(table);
    if (cached) return cached;
    const logical = this.col(table);
    const select = "?$select=EntitySetName,PrimaryIdAttribute" + (table === "jobentry" ? "&$expand=ManyToOneRelationships($select=ReferencingAttribute,ReferencingEntityNavigationPropertyName)" : "");
    const request = this.call("EntityDefinitions(LogicalName='" + logical + "')" + select).then(async response => {
      const value = await response.json() as Metadata;
      if (!/^[a-z][a-z0-9_]*$/.test(value.EntitySetName) || value.PrimaryIdAttribute !== logical + "id") throw unavailable();
      return value;
    }).catch(() => { this.metadata.delete(table); throw unavailable(); });
    this.metadata.set(table, request);
    return request;
  }
  async bind(name: "candidate" | "vacancy", table: Table, id: string): Promise<Row> {
    const [entry, target] = await Promise.all([this.describe("jobentry"), this.describe(table)]);
    const nav = entry.ManyToOneRelationships?.find(r => r.ReferencingAttribute === this.col(name))?.ReferencingEntityNavigationPropertyName;
    if (!nav) throw unavailable();
    return { [nav + "@odata.bind"]: "/" + target.EntitySetName + "(" + id + ")" };
  }
  async list(table: Table, columns: string[], filter = "", limit?: number): Promise<Row[]> {
    const meta = await this.describe(table);
    const query = new URLSearchParams({ "$select": [meta.PrimaryIdAttribute, ...columns].join(","), "$orderby": "createdon desc," + meta.PrimaryIdAttribute + " asc" });
    if (filter) query.set("$filter", filter);
    if (limit) query.set("$top", String(limit));
    const items: Row[] = [];
    let next: string | undefined = this.root + meta.EntitySetName + "?" + query;
    while (next) {
      const response = await this.call(next, { headers: { Prefer: "odata.maxpagesize=250" } });
      const page = await response.json() as { value: Row[]; "@odata.nextLink"?: string };
      if (!Array.isArray(page.value)) throw unavailable();
      items.push(...page.value);
      next = page["@odata.nextLink"];
    }
    return items;
  }
  async get(table: Table, id: string, columns: string[]): Promise<Row | null> {
    const meta = await this.describe(table);
    const query = new URLSearchParams({ "$select": [meta.PrimaryIdAttribute, ...columns].join(",") });
    try { return await (await this.call(meta.EntitySetName + "(" + id + ")?" + query)).json() as Row; }
    catch (error) { if (error instanceof HttpError && error.status === 404) return null; throw error; }
  }
  // Test authenticated reads without requesting any applicant data.
  async verifyReads() {
    const tables: Table[] = ["jobprofile", "jobentry", "jobvacancy"];
    await Promise.all(tables.map(async table => {
      const meta = await this.describe(table);
      const query = new URLSearchParams({ "$select": meta.PrimaryIdAttribute, "$filter": meta.PrimaryIdAttribute + " eq null", "$top": "1" });
      const response = await this.call(meta.EntitySetName + "?" + query);
      const page = await response.json() as { value?: unknown };
      if (!Array.isArray(page.value) || page.value.length !== 0) throw unavailable();
    }));
  }
  // The vacancy check and insertion are one transaction. Closing a vacancy concurrently
  // invalidates the ETag, and a second application from the same person cannot be inserted.
  async submit(vacancyId: string, vacancyVersion: string, entryId: string, data: Row) {
    const [vacancies, entries] = await Promise.all([this.describe("jobvacancy"), this.describe("jobentry")]);
    const batch = "batch_" + crypto.randomUUID();
    const change = "changeset_" + crypto.randomUUID();
    const part = (number: number, path: string, condition: string, payload: Row) => [
      "--" + change, "Content-Type: application/http", "Content-Transfer-Encoding: binary", "Content-ID: " + number, "",
      "PATCH " + this.root + path + " HTTP/1.1", "Content-Type: application/json", condition, "", JSON.stringify(payload)
    ];
    const body = ["--" + batch, "Content-Type: multipart/mixed; boundary=" + change, "",
      ...part(1, vacancies.EntitySetName + "(" + vacancyId + ")", "If-Match: " + vacancyVersion, { [this.col("open")]: true }),
      ...part(2, entries.EntitySetName + "(" + entryId + ")", "If-None-Match: *", data),
      "--" + change + "--", "--" + batch + "--", ""].join("\r\n");
    const reply = await this.call("$batch", { method: "POST", headers: { "Content-Type": "multipart/mixed; boundary=" + batch }, body });
    const codes = [...(await reply.text()).matchAll(/^HTTP\/1\.[01] (\d{3})/gm)].map(match => Number(match[1]));
    if (codes.some(code => code === 412 || code === 404)) throw new HttpError(409, "The vacancy changed. Refresh before applying again.");
    if (codes.length !== 2 || codes.some(code => code < 200 || code >= 300)) throw unavailable();
  }
  async write(table: Table, id: string, values: Row, version: string | null) {
    const meta = await this.describe(table);
    const condition: Record<string, string> = version ? { "If-Match": version } : { "If-None-Match": "*" };
    await this.call(meta.EntitySetName + "(" + id + ")", { method: "PATCH", headers: condition, body: JSON.stringify(values) });
  }
}
let database: JobsDataverse | undefined;
export function jobsDatabase() {
  if (database) return database;
  const { origin, prefix, credential } = jobsConnection(process.env);
  database = new JobsDataverse(origin, prefix, scope => credential.getToken(scope));
  return database;
}

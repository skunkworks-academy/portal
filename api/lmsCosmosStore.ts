import type { LmsStore } from "./lmsDomain.js";
import { HttpError } from "./http.js";

/** Azure Cosmos DB NoSQL REST adapter, using a managed-identity token provider. */
export class CosmosLmsStore implements LmsStore {
  constructor(private endpoint: string, private database: string, private container: string, private getToken: () => Promise<string>) {
    if (!endpoint.startsWith("https://")) throw Error("Cosmos HTTPS endpoint required.");
  }
  private get docs() { return "/dbs/" + encodeURIComponent(this.database) + "/colls/" + encodeURIComponent(this.container) + "/docs"; }
  private async call(path: string, method: string, body?: unknown, headers: Record<string,string> = {}) {
    const response = await fetch(this.endpoint.replace(/\/$/, "") + path, { method, headers: {
      authorization: "Bearer " + await this.getToken(), "x-ms-version": "2018-12-31", "x-ms-date": new Date().toUTCString(),
      "content-type": "application/json", ...headers
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 404) return null;
    if ([409,412].includes(response.status)) throw new HttpError(409, "LMS write conflict.");
    if (!response.ok) throw new HttpError(503, "LMS database unavailable.");
    return response.json() as Promise<Record<string, unknown>>;
  }
  async get<T>(collection: string, key: string): Promise<T | null> {
    const partition = key.split(":")[0];
    const doc = await this.call(this.docs + "/" + encodeURIComponent(collection + ":" + key), "GET", undefined, { "x-ms-documentdb-partitionkey": JSON.stringify([partition]) });
    return doc ? doc.value as T : null;
  }
  async put<T>(collection: string, key: string, value: T, options?: { ifAbsent?: boolean }): Promise<void> {
    const partition = key.split(":")[0];
    await this.call(this.docs, "POST", { id: collection + ":" + key, organizationId: partition, collection, value }, {
      "x-ms-documentdb-partitionkey": JSON.stringify([partition]),
      "x-ms-documentdb-is-upsert": options?.ifAbsent ? "false" : "true"
    });
  }
  async list<T>(collection: string, prefix: string): Promise<T[]> {
    const partition = prefix.split(":")[0];
    if (!partition || !prefix.startsWith(partition + ":")) throw new HttpError(400, "Organization partition required.");
    const result = await this.call(this.docs, "POST", {
      query: "SELECT c.value FROM c WHERE c.collection = @collection AND STARTSWITH(c.id, @prefix)",
      parameters: [{ name: "@collection", value: collection }, { name: "@prefix", value: collection + ":" + prefix }]
    }, {
      "x-ms-documentdb-isquery": "true",
      "x-ms-documentdb-query-enablecrosspartition": "false",
      "x-ms-documentdb-partitionkey": JSON.stringify([partition])
    });
    return ((result?.Documents ?? []) as Array<{ value: T }>).map(d => d.value);
  }
}

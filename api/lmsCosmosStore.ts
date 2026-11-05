import type { LmsStore } from "./lmsDomain.js";
import { HttpError } from "./http.js";

/** Azure Cosmos DB NoSQL REST adapter, using a managed-identity token provider. */
export class CosmosLmsStore implements LmsStore {
  constructor(private endpoint: string, private database: string, private container: string, private getToken: () => Promise<string>) {
    if (!endpoint.startsWith("https://")) throw Error("Cosmos HTTPS endpoint required.");
  }
  private get docs() { return "/dbs/" + encodeURIComponent(this.database) + "/colls/" + encodeURIComponent(this.container) + "/docs"; }
  private async call(path: string, method: string, body?: unknown, headers: Record<string,string> = {}) {
    let response: Response;
    try {
      response = await fetch(this.endpoint.replace(/\/$/, "") + path, { method, headers: {
      authorization: encodeURIComponent("type=aad&ver=1.0&sig=" + await this.getToken()), "x-ms-version": "2018-12-31", "x-ms-date": new Date().toUTCString(),
      "content-type": "application/json", ...headers
      }, signal: AbortSignal.timeout(15000), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      // Identity and network failures must not expose tokens or provider details.
      throw new HttpError(503, "LMS database unavailable.");
    }
    if (response.status === 404 && (method === "GET" || method === "DELETE")) return null;
    if ([409,412].includes(response.status)) throw new HttpError(409, "LMS write conflict.");
    if (!response.ok) throw new HttpError(503, "LMS database unavailable.");
    if (response.status === 204) return { data: {}, continuation: null, etag: null };
    return { data: await response.json() as Record<string, unknown>, continuation: response.headers.get("x-ms-continuation"), etag: response.headers.get("etag") };
  }
  async get<T>(collection: string, key: string): Promise<T | null> {
    const partition = key.split(":")[0];
    const doc = await this.call(this.docs + "/" + encodeURIComponent(collection + ":" + key), "GET", undefined, { "x-ms-documentdb-partitionkey": JSON.stringify([partition]) });
    return doc ? doc.data.value as T : null;
  }
  /** SCIM must use the Cosmos ETag for read/modify/write so simultaneous PATCHes cannot overwrite one another. */
  async getWithEtag<T>(collection: string, key: string): Promise<{ value: T; etag: string } | null> {
    const partition = key.split(":")[0];
    const doc = await this.call(this.docs + "/" + encodeURIComponent(collection + ":" + key), "GET", undefined, {
      "x-ms-documentdb-partitionkey": JSON.stringify([partition])
    });
    if (!doc) return null;
    if (!doc.etag) throw new HttpError(503, "LMS database version unavailable.");
    return { value: doc.data.value as T, etag: doc.etag };
  }
  /** Conditional replacement; Cosmos HTTP 412 becomes HttpError(409). */
  async putIfMatch<T>(collection: string, key: string, value: T, etag: string): Promise<void> {
    if (!etag || !/^["A-Za-z0-9_=-]+$/.test(etag)) throw new HttpError(503, "LMS database version unavailable.");
    const partition = key.split(":")[0];
    await this.call(this.docs + "/" + encodeURIComponent(collection + ":" + key), "PUT", {
      id: collection + ":" + key, organizationId: partition, collection, value
    }, { "x-ms-documentdb-partitionkey": JSON.stringify([partition]), "If-Match": etag });
  }
  async put<T>(collection: string, key: string, value: T, options?: { ifAbsent?: boolean }): Promise<void> {
    const partition = key.split(":")[0];
    await this.call(this.docs, "POST", { id: collection + ":" + key, organizationId: partition, collection, value }, {
      "x-ms-documentdb-partitionkey": JSON.stringify([partition]),
      "x-ms-documentdb-is-upsert": options?.ifAbsent ? "false" : "true"
    });
  }
  async delete(collection: string, key: string): Promise<void> {
    const partition = key.split(":")[0];
    await this.call(this.docs + "/" + encodeURIComponent(collection + ":" + key), "DELETE", undefined, {
      "x-ms-documentdb-partitionkey": JSON.stringify([partition])
    });
  }
  async list<T>(collection: string, prefix: string): Promise<T[]> {
    const partition = prefix.split(":")[0];
    if (!partition || !prefix.startsWith(partition + ":")) throw new HttpError(400, "Organization partition required.");
    const records: T[] = [];
    let continuation: string | null = null;
    do {
      const result = await this.call(this.docs, "POST", {
      // VALUE is a Cosmos SQL keyword. Bracket notation addresses the stored
      // property; SELECT VALUE returns the original record without a wrapper.
      query: 'SELECT VALUE c["value"] FROM c WHERE c["collection"] = @collection AND STARTSWITH(c["id"], @prefix)',
      parameters: [{ name: "@collection", value: collection }, { name: "@prefix", value: collection + ":" + prefix }]
    }, {
      "content-type": "application/query+json",
      "x-ms-documentdb-isquery": "true",
      "x-ms-documentdb-query-enablecrosspartition": "false",
      "x-ms-documentdb-partitionkey": JSON.stringify([partition]),
      ...(continuation ? { "x-ms-continuation": continuation } : {})
    });
      if (!Array.isArray(result?.data.Documents)) throw new HttpError(503, "LMS database unavailable.");
      records.push(...(result.data.Documents as T[]));
      continuation = result?.continuation ?? null;
    } while (continuation);
    return records;
  }
}

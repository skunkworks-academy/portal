import { isDeepStrictEqual } from "node:util";
import { HttpError } from "./http.js";

export interface BudgetStoreDocument {
  id: string;
  organizationId: string;
  collection: "skunkie-budget-v1";
  // A container TTL must never reset a current month's allowance.
  ttl: -1;
  value: unknown;
}

export interface BudgetStoreRecord { document: BudgetStoreDocument; etag: string }
export interface SkunkieBudgetStore {
  read(id: string, organizationId: string): Promise<BudgetStoreRecord | null>;
  /** false means a definitive conflict, never an ambiguous network failure. */
  create(document: BudgetStoreDocument): Promise<boolean>;
  replace(document: BudgetStoreDocument, etag: string): Promise<boolean>;
}

export function budgetStorageUnavailable() {
  return new HttpError(503, "Skunkie allowance storage is unavailable. Please try again later.");
}

/** Uses the existing organization-partitioned Cosmos container and managed identity.
 * Requires a single Cosmos write region at runtime. No upserts,
 * unconditional replacements, automatic write retries, or reservation deletion.
 */
export class CosmosSkunkieBudgetStore implements SkunkieBudgetStore {
  private readonly endpoint: string;
  private readonly containerPath: string;

  constructor(endpoint: string, database: string, container: string, private readonly getToken: () => Promise<string>) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !database.trim() || !container.trim()) throw Error();
      this.endpoint = url.origin;
      this.containerPath = `/dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}`;
    } catch { throw budgetStorageUnavailable(); }
  }

  private async call(path: string, method: string, organizationId?: string, body?: BudgetStoreDocument, extra: Record<string, string> = {}) {
    try {
      const token = await this.getToken();
      if (!token) throw Error();
      return await fetch(this.endpoint + path, {
        method,
        headers: {
          authorization: encodeURIComponent(`type=aad&ver=1.0&sig=${token}`),
          "x-ms-version": "2018-12-31", "x-ms-date": new Date().toUTCString(),
          "content-type": "application/json",
          ...(organizationId ? { "x-ms-documentdb-partitionkey": JSON.stringify([organizationId]) } : {}),
          ...extra
        },
        signal: AbortSignal.timeout(15000),
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw budgetStorageUnavailable(); }
  }

  private async json(response: Response): Promise<Record<string, unknown>> {
    try {
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
      return data as Record<string, unknown>;
    } catch { throw budgetStorageUnavailable(); }
  }

  private record(data: Record<string, unknown>, response: Response, id: string, organizationId: string): BudgetStoreRecord {
    const etag = response.headers.get("etag") || data._etag;
    if (typeof etag !== "string" || !etag || etag === "*" || data.id !== id || data.organizationId !== organizationId ||
        data.collection !== "skunkie-budget-v1" || data.ttl !== -1 || !Object.hasOwn(data, "value")) throw budgetStorageUnavailable();
    return {
      document: { id, organizationId, collection: "skunkie-budget-v1", ttl: -1, value: data.value }, etag
    };
  }

  private async requireSingleWriter() {
    // Data-plane account metadata uses the same identity/readMetadata permission
    // as Cosmos SDK discovery. Multi-write replicas can each accept a local ETag;
    // that cannot enforce this monetary cap. Do not cache topology across calls.
    const response = await this.call("/", "GET");
    if (response.status !== 200) { await response.body?.cancel(); throw budgetStorageUnavailable(); }
    const account = await this.json(response);
    // The documented data-plane response may omit the boolean; the complete
    // writableLocations list is authoritative. Reject a contradictory flag.
    if ((account.enableMultipleWriteLocations !== undefined && account.enableMultipleWriteLocations !== false) ||
        !Array.isArray(account.writableLocations) || account.writableLocations.length !== 1 ||
        !account.writableLocations[0] || typeof account.writableLocations[0] !== "object") throw budgetStorageUnavailable();
    const location = account.writableLocations[0] as Record<string, unknown>;
    const name = location.name ?? location.Name;
    const endpoint = location.databaseAccountEndpoint ?? location.DatabaseAccountEndpoint;
    if (typeof name !== "string" || !name.trim() || typeof endpoint !== "string") throw budgetStorageUnavailable();
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error();
    } catch { throw budgetStorageUnavailable(); }
  }

  async read(id: string, organizationId: string): Promise<BudgetStoreRecord | null> {
    await this.requireSingleWriter();
    const response = await this.call(`${this.containerPath}/docs/${encodeURIComponent(id)}`, "GET", organizationId);
    if (response.status === 404) {
      await response.body?.cancel();
      // Cosmos also returns 404 for an absent database/container. That is an
      // outage, not a fresh allowance, and a different partition key is unsafe.
      const container = await this.call(this.containerPath, "GET");
      if (container.status !== 200) { await container.body?.cancel(); throw budgetStorageUnavailable(); }
      const data = await this.json(container);
      const partition = data.partitionKey as { paths?: unknown; kind?: unknown } | undefined;
      if (!isDeepStrictEqual(partition?.paths, ["/organizationId"]) || partition?.kind !== "Hash") throw budgetStorageUnavailable();
      return null;
    }
    if (response.status !== 200) { await response.body?.cancel(); throw budgetStorageUnavailable(); }
    return this.record(await this.json(response), response, id, organizationId);
  }

  private async write(document: BudgetStoreDocument, etag?: string): Promise<boolean> {
    if (etag !== undefined && (!etag || etag === "*")) throw budgetStorageUnavailable();
    await this.requireSingleWriter();
    const response = await this.call(
      `${this.containerPath}/docs${etag === undefined ? "" : "/" + encodeURIComponent(document.id)}`,
      etag === undefined ? "POST" : "PUT", document.organizationId, document,
      etag === undefined ? { "x-ms-documentdb-is-upsert": "false" } : { "If-Match": etag }
    );
    if ((etag === undefined && response.status === 409) || (etag !== undefined && response.status === 412)) {
      await response.body?.cancel();
      return false;
    }
    if (response.status !== (etag === undefined ? 201 : 200)) { await response.body?.cancel(); throw budgetStorageUnavailable(); }
    const saved = this.record(await this.json(response), response, document.id, document.organizationId);
    if (!isDeepStrictEqual(saved.document, document)) throw budgetStorageUnavailable();
    return true;
  }

  create(document: BudgetStoreDocument) { return this.write(document); }
  replace(document: BudgetStoreDocument, etag: string) { return this.write(document, etag); }
}

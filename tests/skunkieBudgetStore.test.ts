import { afterEach, describe, expect, it, vi } from "vitest";
import { CosmosSkunkieBudgetStore, type BudgetStoreDocument } from "../api/skunkieBudgetStore.js";

afterEach(() => vi.unstubAllGlobals());
const document: BudgetStoreDocument = { id: "skunkie-budget-v1:hash:2026-11", organizationId: "academy", collection: "skunkie-budget-v1", ttl: -1, value: { version: 1 } };
const store = (token = async () => "test+token/=") => new CosmosSkunkieBudgetStore("https://academy.documents.azure.com", "academy", "records", token);
const record = (status = 200, value: unknown = document) => new Response(JSON.stringify(value), { status, headers: { etag: '"v1"' } });
const topology = { enableMultipleWriteLocations: false, writableLocations: [{ name: "South Africa North", databaseAccountEndpoint: "https://academy-southafricanorth.documents.azure.com/" }] };
function installFetch(fetch: (url: string, options: RequestInit) => unknown) {
  vi.stubGlobal("fetch", (url: string, options: RequestInit) => url === "https://academy.documents.azure.com/"
    ? Promise.resolve(new Response(JSON.stringify(topology))) : fetch(url, options));
}

describe("Skunkie budget Cosmos conditional-write contract", () => {
  it("reads in the exact organization partition and uses managed identity", async () => {
    const fetch = vi.fn().mockResolvedValue(record());
    installFetch(fetch);
    expect(await store().read(document.id, "academy")).toEqual({ document, etag: '"v1"' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/dbs/academy/colls/records/docs/skunkie-budget-v1%3Ahash%3A2026-11");
    expect(options.headers["x-ms-documentdb-partitionkey"]).toBe('["academy"]');
    expect(decodeURIComponent(options.headers.authorization)).toBe("type=aad&ver=1.0&sig=test+token/=");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses create-if-absent and the exact ETag on replacement, with TTL disabled", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(record(201)).mockResolvedValueOnce(record());
    installFetch(fetch);
    const adapter = store();
    expect(await adapter.create(document)).toBe(true);
    expect(await adapter.replace(document, '"previous"')).toBe(true);
    const create = fetch.mock.calls[0][1];
    const replace = fetch.mock.calls[1][1];
    expect(create.method).toBe("POST");
    expect(create.headers["x-ms-documentdb-is-upsert"]).toBe("false");
    expect(JSON.parse(create.body)).toMatchObject({ organizationId: "academy", ttl: -1 });
    expect(replace.method).toBe("PUT");
    expect(replace.headers["If-Match"]).toBe('"previous"');
    expect(replace.headers["x-ms-documentdb-is-upsert"]).toBeUndefined();
    await expect(adapter.replace(document, "*")).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("only retries definitive create409 or replace412 conflicts", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 409 }))
      .mockResolvedValueOnce(new Response("", { status: 412 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    installFetch(fetch);
    expect(await store().create(document)).toBe(false);
    expect(await store().replace(document, '"v0"')).toBe(false);
    await expect(store().create(document)).rejects.toMatchObject({ status: 503 });
    await expect(store().replace(document, '"v0"')).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("checks that the container exists with the correct partition before reporting no usage", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ partitionKey: { paths: ["/organizationId"], kind: "Hash" } })))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    installFetch(fetch);
    expect(await store().read(document.id, "academy")).toBeNull();
    await expect(store().read(document.id, "academy")).rejects.toMatchObject({ status: 503 });
    expect(fetch.mock.calls[1][0]).toBe("https://academy.documents.azure.com/dbs/academy/colls/records");
  });

  it("fails closed for missing or different partition configuration", async () => {
    for (const body of [{}, { partitionKey: { paths: ["/tenant"], kind: "Hash" } }, { partitionKey: { paths: ["/organizationId", "/subject"], kind: "MultiHash" } }]) {
      installFetch(vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify(body))));
      await expect(store().read(document.id, "academy")).rejects.toMatchObject({ status: 503 });
    }
  });

  it("rejects malformed success responses and missing ETags rather than authorizing a dispatch", async () => {
    const responses = [new Response("not JSON", { status: 201 }), record(201, {}),
      new Response(JSON.stringify(document), { status: 201 }), record(201, { ...document, organizationId: "other" }),
      record(201, { ...document, value: { version: 99 } }), record(201, { ...document, ttl: 3600 })];
    for (const response of responses) {
      installFetch(vi.fn().mockResolvedValue(response));
      await expect(store().create(document)).rejects.toMatchObject({ status: 503 });
    }
  });

  it("never retries an ambiguous transport failure or leaks provider/token errors", async () => {
    const fetch = vi.fn().mockRejectedValue(Error("private token and storage URL"));
    installFetch(fetch);
    await expect(store().create(document)).rejects.toMatchObject({ status: 503, message: "Skunkie allowance storage is unavailable. Please try again later." });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(store(async () => { throw Error("credential secret"); }).read(document.id, "academy")).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("checks current single-write topology before every operation without a process cache", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(topology)))
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...topology, enableMultipleWriteLocations: true })));
    vi.stubGlobal("fetch", fetch);
    const adapter = store();
    await adapter.read(document.id, "academy");
    await expect(adapter.replace(document, '"v1"')).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.filter(([, options]) => options.method !== "GET")).toHaveLength(0);
  });

  it("accepts the documented single-writer REST response when the optional multi-write flag is omitted", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ writableLocations: [{
      Name: "South Africa North", DatabaseAccountEndpoint: "https://academy-southafricanorth.documents.azure.com:443/"
    }] }))).mockResolvedValueOnce(record());
    vi.stubGlobal("fetch", fetch);
    expect(await store().read(document.id, "academy")).toEqual({ document, etag: '"v1"' });
  });

  it("fails closed on ambiguous, unavailable or multi-region writer metadata", async () => {
    for (const metadata of [{}, { writableLocations: [{}] }, { enableMultipleWriteLocations: false, writableLocations: [] },
      { enableMultipleWriteLocations: false, writableLocations: [{}, {}] },
      { enableMultipleWriteLocations: true, writableLocations: [{}] },
      { enableMultipleWriteLocations: false, writableLocations: [{}] },
      { enableMultipleWriteLocations: false, writableLocations: [null] }]) {
      const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(metadata)));
      vi.stubGlobal("fetch", fetch);
      await expect(store().create(document)).rejects.toMatchObject({ status: 503 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][1].method).toBe("GET");
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(store().read(document.id, "academy")).rejects.toMatchObject({ status: 503 });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { CosmosLmsStore } from "../api/lmsCosmosStore.js";

afterEach(() => vi.unstubAllGlobals());
const store = () => new CosmosLmsStore("https://academy.documents.azure.com", "academy", "records", async () => "test+token/=");

describe("Cosmos managed-identity REST contract", () => {
  it("encodes the AAD token and follows query continuation within one organization", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ Documents: [{ id: "one" }] }), { headers: { "x-ms-continuation": "page-2" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Documents: [{ id: "two" }] })));
    vi.stubGlobal("fetch", fetch);
    expect(await store().list("lmsCourses", "academy:")).toEqual([{ id: "one" }, { id: "two" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const first = fetch.mock.calls[0][1];
    expect(decodeURIComponent(first.headers.authorization)).toBe("type=aad&ver=1.0&sig=test+token/=");
    expect(first.headers["content-type"]).toBe("application/query+json");
    expect(first.headers["x-ms-documentdb-partitionkey"]).toBe('["academy"]');
    expect(first.headers["x-ms-documentdb-query-enablecrosspartition"]).toBe("false");
    expect(JSON.parse(first.body).parameters[1].value).toBe("lmsCourses:academy:");
    expect(JSON.parse(first.body).query).toBe('SELECT VALUE c["value"] FROM c WHERE c["collection"] = @collection AND STARTSWITH(c["id"], @prefix)');
    expect(fetch.mock.calls[1][1].headers["x-ms-continuation"]).toBe("page-2");
  });

  it("preserves record fields named value instead of unwrapping the record twice", async () => {
    const record = { id: "course", value: "a legitimate record field", title: "Existing course" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ Documents: [record] }))));
    expect(await store().list("lmsCourses", "academy:")).toEqual([record]);
  });

  it("distinguishes a genuine empty catalogue from an invalid provider response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ Documents: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: [] }))));
    expect(await store().list("lmsCourses", "academy:")).toEqual([]);
    await expect(store().list("lmsCourses", "academy:")).rejects.toMatchObject({ status: 503 });
  });

  it("retains create-only semantics and serializes records with their partition", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await store().put("lmsCourses", "academy:course", { title: "Course" }, { ifAbsent: true });
    expect(fetch.mock.calls[0][1].headers["x-ms-documentdb-is-upsert"]).toBe("false");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ organizationId: "academy", id: "lmsCourses:academy:course" });
  });

  it("only treats a missing document read as absent; missing query/write storage is an outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("", { status: 404 })));
    expect(await store().get("lmsCourses", "academy:missing")).toBeNull();
    await expect(store().list("lmsCourses", "academy:")).rejects.toMatchObject({ status: 503 });
    await expect(store().put("lmsCourses", "academy:new", {})).rejects.toMatchObject({ status: 503 });
  });

  it("keeps write conflicts distinguishable from storage outages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 409 })));
    await expect(store().put("lmsCourses", "academy:existing", {})).rejects.toMatchObject({ status: 409 });
  });

  it("redacts identity and network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private provider detail")));
    await expect(store().list("lmsCourses", "academy:")).rejects.toMatchObject({ status: 503, message: "LMS database unavailable." });
    const denied = new CosmosLmsStore("https://academy.documents.azure.com", "academy", "records", async () => { throw Error("private credential detail"); });
    await expect(denied.list("lmsCourses", "academy:")).rejects.toMatchObject({ status: 503, message: "LMS database unavailable." });
  });
});

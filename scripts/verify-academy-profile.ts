import { randomUUID } from "node:crypto";
import { ClientSecretCredential } from "@azure/identity";
import { config } from "../api/config.js";
import { getMyProfile, upsertMyProfile } from "../api/graph.js";
import type { PortalProfile, PortalProfileInput } from "../src/types.js";

// A reserved subject and an undeliverable address keep this fixture separate from signed-in users.
const runId = randomUUID();
const principal = {
  subject: "academy-profile-verification-" + runId,
  name: "Academy profile verification",
  email: runId + "@profile-check.invalid",
  tenantId: config.graphTenantId,
  roles: []
};
const input: PortalProfileInput = {
  displayName: principal.name, phone: "0000000000", location: "Verification", bio: "Initial verification.", portalRole: "Student"
};

function check(stage: string, profile: PortalProfile | null, expected: PortalProfileInput) {
  if (!profile?.id || profile.objectId !== principal.subject || profile.email !== principal.email) {
    throw new Error(stage + " did not return the verification profile.");
  }
  const fields = ["displayName", "phone", "location", "bio", "portalRole"] as const;
  const mismatches = fields.filter(field => profile[field] !== expected[field]);
  if (mismatches.length) {
    const details = mismatches.map(field => {
      const actual = profile[field];
      const shape = !actual ? "empty" : /^\s*</.test(actual) ? "markup" : "length " + actual.length;
      return field + " (" + shape + ")";
    });
    throw new Error(stage + " did not preserve " + details.join(", ") + ".");
  }
  console.log("Verified " + stage + ".");
}

async function main() {
  const credential = new ClientSecretCredential(config.graphTenantId, config.apiClientId, config.apiClientSecret);
  const auth = await credential.getToken("https://graph.microsoft.com/.default");
  if (!auth) throw new Error("Microsoft Graph authentication failed.");
  const authorization = "Bearer " + auth.token;
  async function graph(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", authorization);
    const result = await fetch("https://graph.microsoft.com/v1.0" + path, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error("Verification fixture request returned HTTP " + result.status + ".");
    return result;
  }
  const site = await (await graph("/sites/" + config.sharePointHostname + ":" + config.sharePointSitePath + "?$select=id")).json() as { id: string };
  const items = "/sites/" + encodeURIComponent(site.id) + "/lists/PortalProfiles/items";
  if (await getMyProfile(principal)) throw new Error("Verification subject already exists.");
  const written = new Set<string>();
  try {
    const created = await upsertMyProfile(input, principal);
    if (created.id) written.add(created.id);
    check("profile creation", created, input);
    check("first reload", await getMyProfile(principal), input);
    const update = { ...input, displayName: "Updated verification", phone: "", location: "Verification updated", bio: "Updated verification.\nSecond line." };
    const edited = await upsertMyProfile(update, principal);
    if (edited.id) written.add(edited.id);
    if (edited.id !== created.id) throw new Error("An update created a second profile.");
    check("profile update", edited, update);
    check("second reload", await getMyProfile(principal), update);
  } finally {
    // A write may have committed even when its acknowledgement failed. Discover only this fixture.
    const query = new URLSearchParams({ "$filter": "fields/ObjectId eq '" + principal.subject + "'", "$select": "id", "$expand": "fields($select=ObjectId,Email)", "$top": "2" });
    const found = await (await graph(items + "?" + query, { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } })).json() as { value: { id: string }[] };
    for (const row of found.value) written.add(row.id);
    for (const target of written) {
      if (!/^\d+$/.test(target)) throw new Error("Invalid verification item identifier.");
      const path = items + "/" + target;
      const row = await (await graph(path + "?$select=id,eTag&$expand=fields($select=ObjectId,Email)")).json() as {
        id: string; eTag?: string; "@odata.etag"?: string; fields: { ObjectId?: string; Email?: string }
      };
      const tag = row.eTag || row["@odata.etag"];
      if (!tag || row.id !== target || row.fields.ObjectId !== principal.subject || row.fields.Email !== principal.email) {
        throw new Error("Verification cleanup could not verify ownership and version.");
      }
      await graph(path, { method: "DELETE", headers: { "If-Match": tag } });
      console.log("Removed the temporary verification profile.");
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Profile storage verification failed.");
  process.exitCode = 1;
});

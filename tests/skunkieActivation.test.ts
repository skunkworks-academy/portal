import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SKUNKIE_BUDGET_POLICY } from "../api/skunkieReadiness.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
const script = resolve(repo, "scripts/verify-skunkie-activation.py");
const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) {
    if (!resolve(path).startsWith(resolve(repo) + sep) || !path.includes(".skunkie-activation-test-")) throw Error("Unexpected fixture path");
    rmSync(path, { recursive: true, force: true });
  }
});
function valid() {
  return {
    settings: [
      { name: "LMS_COSMOS_ENDPOINT", value: "https://academy-budget.documents.azure.com:443/" },
      { name: "LMS_COSMOS_DATABASE", value: "academy" }, { name: "LMS_COSMOS_CONTAINER", value: "lms" },
      { name: "LMS_HOME_ORGANIZATION_ID", value: "academy" }
    ],
    account: { name: "academy-ai", kind: "OpenAI", endpoint: "https://academy-ai.openai.azure.com/", provisioningState: "Succeeded" },
    deployment: { name: "skunkie", sku: { name: "GlobalStandard" }, properties: {
      provisioningState: "Succeeded", versionUpgradeOption: "NoAutoUpgrade", model: { format: "OpenAI", name: "gpt-4.1-mini", version: "2025-04-14" }
    } },
    cosmos: { name: "academy-budget", documentEndpoint: "https://academy-budget.documents.azure.com:443/", provisioningState: "Succeeded",
      enableMultipleWriteLocations: false, writeLocations: [{ locationName: "South Africa North" }] },
    container: { id: "lms", partitionKey: { paths: ["/organizationId"], kind: "Hash" } },
    health: { ok: true, skunkieSettings: { configured: false, budgetPolicy: SKUNKIE_BUDGET_POLICY } }
  };
}
function verify(data = valid(), overrides: string[] = [], mode = "verify") {
  const fixture = mkdtempSync(resolve(repo, ".skunkie-activation-test-")); fixtures.push(fixture);
  const args = [script, mode, "--endpoint", "https://academy-ai.openai.azure.com/", "--deployment-name", "skunkie", "--api-version", "2024-10-21"];
  for (const [key, value] of Object.entries(data)) {
    const path = resolve(fixture, `${key}.json`); writeFileSync(path, JSON.stringify(value)); args.push(`--${key}`, path);
  }
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", [...args, ...overrides], { encoding: "utf8", timeout: 10000 });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
describe("Skunkie activation guard", () => {
  it("accepts only the reviewed cloud contract and a live protected release, before any provider activation", () => {
    const result = verify();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({ policy: SKUNKIE_BUDGET_POLICY, model: "gpt-4.1-mini", topology: "single-write-region" });
  });
  it.each(["model", "version", "sku", "upgrade", "state"])("refuses changed deployment %s", field => {
    const data = valid();
    if (field === "model") data.deployment.properties.model.name = "gpt-4.1";
    if (field === "version") data.deployment.properties.model.version = "latest";
    if (field === "sku") data.deployment.sku.name = "Standard";
    if (field === "upgrade") data.deployment.properties.versionUpgradeOption = "OnceNewDefaultVersionAvailable";
    if (field === "state") data.deployment.properties.provisioningState = "Creating";
    expect(verify(data).status).toBe(1);
  });
  it.each(["multi", "two", "none", "missing"])("refuses unsafe or unknown Cosmos topology %s", state => {
    const data = valid();
    if (state === "multi") data.cosmos.enableMultipleWriteLocations = true;
    if (state === "two") data.cosmos.writeLocations.push({ locationName: "West Europe" });
    if (state === "none") data.cosmos.writeLocations = [];
    if (state === "missing") delete (data.cosmos as Partial<typeof data.cosmos>).enableMultipleWriteLocations;
    expect(verify(data).status).toBe(1);
  });
  it("refuses a different configured account, container partition, or incomplete settings", () => {
    let data = valid(); data.account.endpoint = "https://other-ai.openai.azure.com/"; expect(verify(data).status).toBe(1);
    data = valid(); data.cosmos.name = "other-budget"; expect(verify(data).status).toBe(1);
    data = valid(); data.container.partitionKey.paths = ["/tenant"]; expect(verify(data).status).toBe(1);
    data = valid(); data.settings.pop(); expect(verify(data).status).toBe(1);
  }, 30_000); // Four separately bounded Python processes can exceed Vitest's default under parallel CI load.
  it("refuses an old release even if its health is otherwise green", () => {
    const data = valid(); delete (data.health.skunkieSettings as Partial<typeof data.health.skunkieSettings>).budgetPolicy;
    expect(verify(data).status).toBe(1);
  });
  it("requires live configured health after activation", () => {
    const data = valid(); expect(verify(data, [], "active").status).toBe(1);
    data.health.skunkieSettings.configured = true;
    expect(verify(data, [], "active").status).toBe(0);
  }, 20_000);
  it("refuses unreviewed API versions and disguised endpoints without exposing their values", () => {
    expect(verify(valid(), ["--api-version", "preview"]).status).toBe(1);
    const result = verify(valid(), ["--endpoint", "https://private-secret@academy-ai.openai.azure.com/"]);
    expect(result.status).toBe(1); expect(result.output).not.toContain("private-secret");
  }, 20_000);
  it("enforces disabled Skunkie provider until a reviewed activation gate is deployed", () => {
    const workflow = readFileSync(resolve(repo, ".github/workflows/deploy-azure-function.yml"), "utf8");
    const pause = workflow.indexOf("- name: Keep Skunkie disabled until the protected release is verified");
    const deploy = workflow.indexOf("- name: Deploy Function package through Azure CLI");
    const health = workflow.indexOf("- name: Verify API health");
    const publication = workflow.indexOf("- name: Verify AI publication and default-deny access contract");
    expect(pause).toBeGreaterThan(0);
    expect(deploy).toBeGreaterThan(pause);
    expect(health).toBeGreaterThan(deploy);
    expect(publication).toBeGreaterThan(health);
    expect(workflow).toContain('--settings "SKUNKIE_BUDGET_POLICY="');
    expect(workflow).toContain("Skunkie pre-activation checks: provider access remains disabled");
    expect(workflow).not.toContain('"AZURE_OPENAI_API_KEY=$SKUNKIE_API_KEY"');
    expect(workflow).not.toContain('"SKUNKIE_BUDGET_POLICY=' + SKUNKIE_BUDGET_POLICY + '"');
  });
});

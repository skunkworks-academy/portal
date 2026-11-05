import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../scripts/verify-protected-api-route.sh", import.meta.url));
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) {
    if (!resolve(path).startsWith(resolve(repo) + sep) || !path.includes(".route-probe-test-")) throw Error("Unexpected fixture path");
    rmSync(path, { recursive: true, force: true });
  }
});
function probe(statuses: string[], followRedirects = false) {
  const fixture = mkdtempSync(resolve(repo, ".route-probe-test-")); fixtures.push(fixture);
  const counts = resolve(fixture, "count"); const environment = resolve(fixture, "fixture.sh");
  writeFileSync(counts, "0\n");
  writeFileSync(environment, [
    'curl() {',
    '  local count; read -r count < "$PROBE_FIXTURE_COUNT"',
    '  local statuses; read -r -a statuses <<< "$PROBE_FIXTURE_STATUSES"',
    '  local index=$count',
    '  if ((index >= ${#statuses[@]})); then index=$((${#statuses[@]} - 1)); fi',
    '  printf "%s\\n" "$((count + 1))" > "$PROBE_FIXTURE_COUNT"',
    '  printf "%s" "${statuses[$index]}"',
    '}',
    'sleep() { :; }',
    ''
  ].join("\n"), { encoding: "utf8" });
  const result = spawnSync(bash, [script, "https://example.invalid/api/protected", ...(followRedirects ? ["--location"] : [])], {
    encoding: "utf8", timeout: 15000,
    env: { ...process.env, BASH_ENV: environment.replaceAll("\\", "/"), PROBE_FIXTURE_COUNT: counts.replaceAll("\\", "/"), PROBE_FIXTURE_STATUSES: statuses.join(" ") }
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr, calls: Number(readFileSync(counts, "utf8")) };
}
describe("protected API deployment probes", () => {
  it.each(["401", "403"])("accepts expected authentication denial %s immediately", status => {
    expect(probe([status], true)).toMatchObject({ status: 0, calls: 1 });
  });
  it("retries temporary missing route registrations then requires authentication denial", () => {
    const result = probe(["404", "404", "401"]);
    expect(result).toMatchObject({ status: 0, calls: 3 });
    expect(result.output).toContain("retrying in 5 seconds");
  });
  it("fails after the fixed retry limit if a route never registers", () => {
    expect(probe(["404"])).toMatchObject({ status: 1, calls: 12 });
  }, 20_000); // Keep the 15-second subprocess deadline authoritative on Windows.
  it.each(["200", "301", "500", "000"])("rejects unexpected status %s without accepting a later response", status => {
    expect(probe([status, "401"])).toMatchObject({ status: 1, calls: 1 });
  });
});

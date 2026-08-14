#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const CANONICAL_PORTAL_ORIGIN = "https://portal.skunkworksacademy.com";
const DEFAULT_TARGET = "https://api.skunkworksacademy.com/api";
const MAX_ESTIMATED_DURATION_MS = 360_000;
const ALLOWED_HOSTS = new Set([
  "api.skunkworksacademy.com",
  "skunkworks-academy-portal-api-za.azurewebsites.net",
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]"
]);

const scenarios = [
  {
    name: "health",
    method: "GET",
    path: "health",
    headers: { accept: "application/json" },
    validate: async (response) => {
      if (response.status !== 200) return `expected HTTP 200, received ${response.status}`;
      const body = await jsonBody(response);
      return body?.ok === true ? null : "health response did not contain ok: true";
    }
  },
  {
    name: "plans",
    method: "GET",
    path: "checkout/plans",
    headers: { accept: "application/json" },
    validate: async (response) => {
      if (response.status !== 200) return `expected HTTP 200, received ${response.status}`;
      const body = await jsonBody(response);
      return Array.isArray(body) && body.some((plan) => plan?.id === "starter-monthly")
        ? null
        : "plans response did not contain the starter-monthly plan";
    }
  },
  {
    name: "staff-auth",
    method: "GET",
    path: "staff/applications",
    headers: { accept: "application/json" },
    validate: async (response) => {
      await response.arrayBuffer();
      return [401, 403].includes(response.status)
        ? null
        : `expected HTTP 401 or 403, received ${response.status}`;
    }
  },
  {
    name: "staff-cors",
    method: "OPTIONS",
    path: "staff/applications",
    headers: {
      origin: CANONICAL_PORTAL_ORIGIN,
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization,content-type"
    },
    validate: async (response) => {
      await response.arrayBuffer();
      if (![200, 204].includes(response.status)) {
        return `expected HTTP 200 or 204, received ${response.status}`;
      }
      const origin = response.headers.get("access-control-allow-origin");
      return origin === CANONICAL_PORTAL_ORIGIN
        ? null
        : `expected Access-Control-Allow-Origin ${CANONICAL_PORTAL_ORIGIN}, received ${origin ?? "none"}`;
    }
  }
];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

let settings;
try {
  settings = readSettings();
} catch (error) {
  console.error(`Invalid portal API load-test configuration: ${message(error)}`);
  process.exit(2);
}

if (process.argv.includes("--validate-only")) {
  console.log(`Validated safe load-test configuration for ${settings.target}.`);
  console.log(`Requests: ${settings.requests}; concurrency: ${settings.concurrency}; rate: ${settings.rps}/s.`);
  process.exit(0);
}

const startedAt = new Date();
const startedAtMs = performance.now();
const execution = await runLoadTest(settings);
const completedAt = new Date();
const report = createReport(settings, startedAt, completedAt, performance.now() - startedAtMs, execution);
await writeReport(settings.reportPath, report);
printSummary(report, settings.reportPath);

const failures = report.summary.failures;
const failureRate = report.summary.failureRate;
const reasons = [];
if (failureRate > settings.maxFailureRate) {
  reasons.push(`failure rate ${formatPercent(failureRate)} exceeded ${formatPercent(settings.maxFailureRate)}`);
}
if (report.summary.p95LatencyMs > settings.maxP95Ms) {
  reasons.push(`p95 latency ${formatMs(report.summary.p95LatencyMs)} exceeded ${formatMs(settings.maxP95Ms)}`);
}

if (reasons.length > 0) {
  console.error(`Load test failed: ${reasons.join("; ")}.`);
  process.exitCode = 1;
} else {
  console.log(`Load test passed with ${failures} failed request(s).`);
}

function readSettings() {
  const target = validateTarget(process.env.PORTAL_LOAD_TARGET ?? DEFAULT_TARGET);
  const settings = {
    target,
    requests: readInteger("PORTAL_LOAD_REQUESTS", 60, 12, 300),
    concurrency: readInteger("PORTAL_LOAD_CONCURRENCY", 4, 1, 12),
    rps: readNumber("PORTAL_LOAD_RPS", 2, 0.25, 10),
    timeoutMs: readInteger("PORTAL_LOAD_TIMEOUT_MS", 10_000, 1_000, 30_000),
    maxP95Ms: readInteger("PORTAL_LOAD_MAX_P95_MS", 5_000, 250, 30_000),
    maxFailureRate: readNumber("PORTAL_LOAD_MAX_FAILURE_RATE", 0.02, 0, 0.2),
    reportPath: resolve(process.env.PORTAL_LOAD_REPORT_PATH ?? "artifacts/portal-api-load-test.json")
  };
  const measuredRequests = settings.requests - scenarios.length;
  const estimatedDurationMs = scenarios.length * settings.timeoutMs
    + (measuredRequests - 1) * (1_000 / settings.rps)
    + Math.ceil(measuredRequests / settings.concurrency) * settings.timeoutMs;
  if (estimatedDurationMs > MAX_ESTIMATED_DURATION_MS) {
    throw new Error(`Requested settings could run for up to ${Math.ceil(estimatedDurationMs / 1_000)} seconds; keep the bounded test within ${MAX_ESTIMATED_DURATION_MS / 1_000} seconds.`);
  }
  return { ...settings, estimatedDurationMs };
}

function validateTarget(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error("PORTAL_LOAD_TARGET must be an absolute URL.");
  }

  const hostname = target.hostname.toLowerCase();
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`PORTAL_LOAD_TARGET host ${hostname} is not allow-listed.`);
  }
  if (target.protocol !== "https:" && !(isLocal && target.protocol === "http:")) {
    throw new Error("PORTAL_LOAD_TARGET must use HTTPS, except for a local HTTP target.");
  }
  if (target.search || target.hash || target.username || target.password) {
    throw new Error("PORTAL_LOAD_TARGET must not include credentials, a query string, or a fragment.");
  }
  if (target.pathname.replace(/\/+$/, "") !== "/api") {
    throw new Error("PORTAL_LOAD_TARGET must end in /api.");
  }

  target.pathname = "/api";
  return target.toString().replace(/\/$/, "");
}

function readInteger(name, fallback, minimum, maximum) {
  const value = readNumber(name, fallback, minimum, maximum);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a whole number.`);
  }
  return value;
}

function readNumber(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a number between ${minimum} and ${maximum}.`);
  }
  return value;
}

async function runLoadTest(settings) {
  const warmupResults = [];
  const intervalMs = 1_000 / settings.rps;
  const warmupStart = performance.now();

  for (const [index, scenario] of scenarios.entries()) {
    const delay = warmupStart + index * intervalMs - performance.now();
    if (delay > 0) await sleep(delay);
    warmupResults.push(await executeScenario(settings, scenario));
  }

  const measuredRequests = settings.requests - warmupResults.length;
  const results = new Array(measuredRequests);
  let nextIndex = 0;
  const scheduleStart = performance.now();

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= measuredRequests) return;

      const delay = scheduleStart + index * intervalMs - performance.now();
      if (delay > 0) await sleep(delay);
      const scenario = scenarios[index % scenarios.length];
      results[index] = await executeScenario(settings, scenario);
    }
  }

  await Promise.all(Array.from({ length: settings.concurrency }, worker));
  return { warmupResults, results };
}

async function executeScenario(settings, scenario) {
  const startedAt = performance.now();
  let status = null;
  try {
    const response = await fetch(joinTarget(settings.target, scenario.path), {
      method: scenario.method,
      headers: scenario.headers,
      redirect: "error",
      signal: AbortSignal.timeout(settings.timeoutMs)
    });
    status = response.status;
    const validationError = await scenario.validate(response);
    return {
      scenario: scenario.name,
      status,
      durationMs: performance.now() - startedAt,
      ok: validationError === null,
      error: validationError ?? undefined
    };
  } catch (error) {
    return {
      scenario: scenario.name,
      status,
      durationMs: performance.now() - startedAt,
      ok: false,
      error: message(error)
    };
  }
}

function joinTarget(target, path) {
  return new URL(path, `${target}/`).toString();
}

async function jsonBody(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function createReport(settings, startedAt, completedAt, elapsedMs, execution) {
  const { warmupResults, results } = execution;
  const allResults = [...warmupResults, ...results];
  const successes = allResults.filter((result) => result.ok).length;
  const failures = allResults.length - successes;
  const latencies = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const byScenario = Object.fromEntries(scenarios.map(({ name }) => [name, summarize(results.filter((result) => result.scenario === name))]));
  const statusCodes = allResults.reduce((counts, result) => {
    const key = result.status === null ? "network-error" : String(result.status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return {
    schemaVersion: 1,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    target: settings.target,
    configuration: {
      requests: settings.requests,
      warmupRequests: warmupResults.length,
      measuredRequests: results.length,
      concurrency: settings.concurrency,
      requestsPerSecond: settings.rps,
      timeoutMs: settings.timeoutMs,
      maxP95Ms: settings.maxP95Ms,
      maxFailureRate: settings.maxFailureRate,
      estimatedMaxDurationMs: settings.estimatedDurationMs
    },
    summary: {
      elapsedMs: round(elapsedMs),
      successes,
      failures,
      failureRate: allResults.length === 0 ? 1 : failures / allResults.length,
      minLatencyMs: round(latencies[0] ?? 0),
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      maxLatencyMs: round(latencies.at(-1) ?? 0),
      statusCodes
    },
    scenarios: byScenario,
    warmup: summarize(warmupResults),
    samples: results.map((result) => ({
      scenario: result.scenario,
      status: result.status,
      durationMs: round(result.durationMs),
      ok: result.ok,
      error: result.error
    })),
    failures: allResults
      .filter((result) => !result.ok)
      .slice(0, 20)
      .map((result) => ({
        scenario: result.scenario,
        status: result.status,
        durationMs: round(result.durationMs),
        error: result.error
      }))
  };
}

function summarize(results) {
  const latencies = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok).length;
  return {
    requests: results.length,
    failures,
    p95LatencyMs: percentile(latencies, 0.95),
    statusCodes: results.reduce((counts, result) => {
      const key = result.status === null ? "network-error" : String(result.status);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})
  };
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  return round(values[Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1)]);
}

async function writeReport(reportPath, report) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printSummary(report, reportPath) {
  const { configuration, summary } = report;
  console.log(`Controlled API load test: ${configuration.requests} read-only requests (${configuration.warmupRequests} warm-up, ${configuration.measuredRequests} measured) at up to ${configuration.requestsPerSecond}/s (concurrency ${configuration.concurrency}; maximum duration ${formatMs(configuration.estimatedMaxDurationMs)}).`);
  console.log(`Target: ${report.target}`);
  console.log(`Results: ${summary.successes}/${configuration.requests} passed; p95 ${formatMs(summary.p95LatencyMs)}; max ${formatMs(summary.maxLatencyMs)}; failure rate ${formatPercent(summary.failureRate)}.`);
  console.log(`Status codes: ${Object.entries(summary.statusCodes).map(([status, count]) => `${status}=${count}`).join(", ")}.`);
  console.log(`Report: ${reportPath}`);
}

function printHelp() {
  console.log(`Usage: node scripts/portal-api-load-test.mjs [--validate-only]\n\nRuns a bounded, read-only load check against the public Portal API. Targets are restricted to approved production hosts or localhost. Each run includes one read-only warm-up request per scenario, with the remaining requests used for latency measurements. The combined request count, rate, and timeout settings must have a worst-case duration of at most ${MAX_ESTIMATED_DURATION_MS / 1_000} seconds.\n\nEnvironment variables:\n  PORTAL_LOAD_TARGET             API base URL ending in /api (default: ${DEFAULT_TARGET})\n  PORTAL_LOAD_REQUESTS           Total requests including warm-up, 12-300 (default: 60)\n  PORTAL_LOAD_CONCURRENCY        Concurrent workers, 1-12 (default: 4)\n  PORTAL_LOAD_RPS                Request starts per second, 0.25-10 (default: 2)\n  PORTAL_LOAD_TIMEOUT_MS         Per-request timeout, 1000-30000 (default: 10000)\n  PORTAL_LOAD_MAX_P95_MS         Maximum accepted p95 latency, 250-30000 (default: 5000)\n  PORTAL_LOAD_MAX_FAILURE_RATE   Maximum accepted failure fraction, 0-0.2 (default: 0.02)\n  PORTAL_LOAD_REPORT_PATH        JSON report path (default: artifacts/portal-api-load-test.json)`);
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function message(error) {
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function formatMs(value) {
  return `${round(value)}ms`;
}

function formatPercent(value) {
  return `${round(value * 100)}%`;
}

import fs from "node:fs";

const contract = JSON.parse(fs.readFileSync("academy-platform-contract.json", "utf8"));
const required = [
  "schemaVersion", "property", "runtimeClass", "canonicalHost", "shellVersion",
  "themeVersion", "identityMode", "analyticsVersion", "cspMode",
  "deploymentWorkflowGeneration", "buildTimestamp"
];

for (const key of required) {
  if (contract[key] === undefined || contract[key] === null || contract[key] === "") {
    throw new Error(`Portal platform contract is missing ${key}`);
  }
}

if (contract.schemaVersion !== 1) throw new Error("Unsupported platform contract schema");
if (contract.property !== "portal") throw new Error("Portal contract property must be portal");
if (contract.runtimeClass !== "spa-functions-bff") throw new Error("Unsupported Portal runtimeClass");
if (contract.canonicalHost !== "portal.skunkworksacademy.com") throw new Error("Unexpected Portal canonical host");
if (!Number.isFinite(Date.parse(contract.buildTimestamp))) throw new Error("buildTimestamp must be ISO-8601");

const supportedIdentityModes = new Set([
  "msal-browser+bff-staging-disabled",
  "bff-session"
]);
if (!supportedIdentityModes.has(contract.identityMode)) {
  throw new Error(`Unsupported Portal identityMode: ${contract.identityMode}`);
}

const supportedCspModes = new Set(["not-enforced", "report-only", "enforced"]);
if (!supportedCspModes.has(contract.cspMode)) {
  throw new Error(`Unsupported Portal cspMode: ${contract.cspMode}`);
}

const indexHtml = fs.readFileSync("index.html", "utf8");
if (!indexHtml.includes(`academy-navigation.js?v=${contract.shellVersion}`)) {
  throw new Error(`Portal shellVersion ${contract.shellVersion} is not the version loaded by index.html`);
}

const theme = fs.readFileSync("src/academy-brand-theme.css", "utf8");
const themeMatch = theme.match(/--swa-portal-theme-contract-version:\s*"([^"]+)"/);
if (!themeMatch) throw new Error("Portal theme contract token is missing");
if (themeMatch[1] !== contract.themeVersion) {
  throw new Error(`Portal themeVersion ${contract.themeVersion} != CSS contract ${themeMatch[1]}`);
}

if (contract.identityMode === "bff-session") {
  const authConfig = fs.readFileSync("src/authConfig.ts", "utf8");
  if (/cacheLocation:\s*"localStorage"/.test(authConfig)) {
    throw new Error("bff-session cannot be declared while MSAL browser tokens persist in localStorage");
  }
}

console.log("Portal platform contract validated:", {
  canonicalHost: contract.canonicalHost,
  shellVersion: contract.shellVersion,
  themeVersion: contract.themeVersion,
  identityMode: contract.identityMode,
  cspMode: contract.cspMode
});

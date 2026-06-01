import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifestPath = join(root, "teams", "manifest.json");
const production = process.argv.includes("--production");
const placeholderGuid = "00000000-0000-0000-0000-000000000000";
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  console.error(`Teams manifest validation failed: ${message}`);
  process.exit(1);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireGuid(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (!guidPattern.test(id)) {
    fail(`${label} must be a GUID.`);
  }
  if (production && id === placeholderGuid) {
    fail(`${label} must be replaced before production packaging.`);
  }
  return id;
}

function requireHttpsUrl(value: unknown, label: string): string {
  const url = requireString(value, label);
  if (!url.startsWith("https://")) {
    fail(`${label} must use https.`);
  }
  return url;
}

if (!existsSync(manifestPath)) {
  fail("teams/manifest.json does not exist.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.manifestVersion !== "1.17") {
  fail("manifestVersion must be 1.17.");
}

requireGuid(manifest.id, "id");
requireString(manifest.name?.short, "name.short");
requireString(manifest.name?.full, "name.full");
requireString(manifest.description?.short, "description.short");
requireString(manifest.description?.full, "description.full");
requireString(manifest.icons?.outline, "icons.outline");
requireString(manifest.icons?.color, "icons.color");

if (manifest.icons.outline !== "outline.png" || manifest.icons.color !== "color.png") {
  fail("icons must reference outline.png and color.png.");
}

for (const iconName of [manifest.icons.outline, manifest.icons.color]) {
  const iconPath = join(root, "teams", iconName);
  if (!existsSync(iconPath)) {
    fail(`${iconName} is missing. Run npm run teams:icons first.`);
  }
  if (statSync(iconPath).size === 0) {
    fail(`${iconName} is empty.`);
  }
}

const [tab] = Array.isArray(manifest.staticTabs) ? manifest.staticTabs : [];
if (!tab) {
  fail("staticTabs must include the personal Portal tab.");
}

requireString(tab.entityId, "staticTabs[0].entityId");
requireString(tab.name, "staticTabs[0].name");
requireHttpsUrl(tab.contentUrl, "staticTabs[0].contentUrl");
requireHttpsUrl(tab.websiteUrl, "staticTabs[0].websiteUrl");

if (!Array.isArray(tab.scopes) || !tab.scopes.includes("personal")) {
  fail("staticTabs[0].scopes must include personal.");
}

if (!Array.isArray(manifest.validDomains)) {
  fail("validDomains must be an array.");
}

for (const domain of ["portal.skunkworksacademy.com", "login.microsoftonline.com"]) {
  if (!manifest.validDomains.includes(domain)) {
    fail(`validDomains must include ${domain}.`);
  }
}

const webApplicationId = requireGuid(manifest.webApplicationInfo?.id, "webApplicationInfo.id");
const resource = requireString(manifest.webApplicationInfo?.resource, "webApplicationInfo.resource");

if (!resource.startsWith("api://")) {
  fail("webApplicationInfo.resource must start with api://.");
}

if (production && resource.includes(placeholderGuid)) {
  fail("webApplicationInfo.resource must use the real API app registration id before production packaging.");
}

console.log(
  production
    ? `Teams manifest is production-ready for ${webApplicationId}.`
    : "Teams manifest scaffold is valid. Run npm run teams:validate:production before packaging."
);

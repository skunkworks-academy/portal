import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures: string[] = [];

function read(path: string) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    failures.push(`Missing required file: ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function must(file: string, content: string, expected: string, reason: string) {
  if (!content.includes(expected)) failures.push(`${file}: ${reason}`);
}

function mustIncludeOneOf(file: string, content: string, expectedValues: readonly string[], reason: string) {
  if (!expectedValues.some((expected) => content.includes(expected))) failures.push(`${file}: ${reason}`);
}

function walk(dir: string, extensions: string[], ignored = new Set<string>()) {
  const base = join(root, dir);
  const files: string[] = [];
  if (!existsSync(base)) return files;

  for (const item of readdirSync(base)) {
    const absolute = join(base, item);
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (ignored.has(rel) || ["node_modules", "dist", ".git", "api-dist"].includes(item)) continue;
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...walk(rel, extensions, ignored));
    else if (extensions.some((extension) => rel.endsWith(extension))) files.push(rel);
  }

  return files;
}

const app = read("src/App.tsx");
const main = read("src/main.tsx");
const toggle = read("src/global-nav-toggle.ts");
const pkg = read("package.json");
const connections = read("connections/index.html");
const connectionsCss = read("connections/assets/styles.css");
const connectionsJs = read("connections/assets/app.js");

// Accept selectors from either a compatibility file or the consolidated stylesheet.
const compatPath = "src/global-nav-compat.css";
const stylesPath = "src/styles.css";

let css = "";
let cssSource = compatPath;

if (existsSync(join(root, compatPath))) {
  css = read(compatPath);
  cssSource = compatPath;
} else if (existsSync(join(root, stylesPath))) {
  css = read(stylesPath);
  cssSource = stylesPath;
} else {
  // Keep the original missing-file message (compat path) so CI output stays familiar.
  failures.push(`Missing required file: ${compatPath}`);
}

const approvedBlackIconConstants = [
  "const BRAND_ICON_BLACK = \"https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png\";",
  "const BRAND_ICON_BLACK = \"https://skunkworksacademy.com/images/favicon-black.png\";"
] as const;
const approvedWhiteIconConstants = [
  "const BRAND_ICON_WHITE = \"https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-white.png\";",
  "const BRAND_ICON_WHITE = \"https://skunkworksacademy.com/images/favicon-white.png\";"
] as const;

mustIncludeOneOf("src/App.tsx", app, approvedBlackIconConstants, "approved black brand icon is required.");
mustIncludeOneOf("src/App.tsx", app, approvedWhiteIconConstants, "approved white brand icon is required.");
must("src/App.tsx", app, "const HOME_URL = \"https://skunkworksacademy.com/\";", "home URL must be the canonical academy domain.");
must("src/App.tsx", app, "className=\"brand\" href={HOME_URL} aria-label=\"Skunkworks Academy home\"", "canonical brand anchor is required.");
must("src/App.tsx", app, "className=\"brand-logo logo-light\" src={BRAND_ICON_BLACK}", "light logo image is required.");
must("src/App.tsx", app, "className=\"brand-logo logo-dark\" src={BRAND_ICON_WHITE}", "dark logo image is required.");
must("src/App.tsx", app, "Skunkworks Academy <span className=\"brand-section\">{eyebrow}</span>", "brand text must stay uniform.");

const navItems = [
  ["Home", "HOME_URL"],
  ["Self-paced", "https://skunkworksacademy.com/self-paced/"],
  ["Portal", "PORTAL_URL"],
  ["Labs", "https://labs.skunkworksacademy.com/"],
  ["Plans", "https://skunkworksacademy.com/subscriptions/#pricing"],
  ["Purchase", "https://skunkworksacademy.com/subscriptions/#purchasing"]
] as const;

for (const [label, href] of navItems) {
  const expected = href.endsWith("_URL") ? `{ label: \"${label}\", href: ${href} }` : `{ label: \"${label}\", href: \"${href}\" }`;
  must("src/App.tsx", app, expected, `global nav item missing: ${label}.`);
}

must("src/App.tsx", app, "<nav className=\"links\" aria-label=\"Primary portal navigation\">", "canonical hidden links nav is required.");
must("src/App.tsx", app, "className=\"nav-action microsoft-signin\"", "Microsoft sign-in action must stay inside the hidden nav.");
must("src/main.tsx", main, "import \"./global-nav-toggle\";", "entrypoint must load the burger toggle.");
must("src/global-nav-toggle.ts", toggle, "global-menu-toggle", "burger toggle class is required.");
must("src/global-nav-toggle.ts", toggle, "brand.insertAdjacentElement", "burger must be inserted after the brand.");
must(cssSource, css, ":not(.global-menu-open) .links", "links must be hidden until the burger is opened.");
must(cssSource, css, ".global-menu-open .links", "links must render when the burger is opened.");
must(cssSource, css, ".global-menu-toggle", "burger styling is required.");
must("package.json", pkg, "\"validate:global-nav\": \"tsx scripts/validate-global-navigation.ts\"", "package must expose the global nav validator.");
must("package.json", pkg, "\"prebuild\": \"npm run validate:global-nav\"", "build must fail before deployment when nav is invalid.");

// Connections is a separate Vite entry and must use the same global topbar contract.
must("connections/index.html", connections, "class=\"top\" data-fallback-header=\"true\"", "canonical global topbar is required.");
must("connections/index.html", connections, "class=\"global-menu-toggle\"", "accessible global menu toggle is required.");
must("connections/index.html", connections, "class=\"links\" id=\"primary-portal-navigation\"", "global navigation flyout is required.");
must("connections/index.html", connections, "aria-label=\"Primary portal navigation\"", "global navigation must have its canonical accessible label.");
must("connections/index.html", connections, "https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png", "Connections must use the current light-scheme Academy icon.");
must("connections/index.html", connections, "https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-white.png", "Connections must use the current dark-scheme Academy icon.");
must("connections/index.html", connections, "href=\"https://skunkworksacademy.com/catalogue/\"", "Connections global menu must link to the current catalogue.");
must("connections/index.html", connections, "href=\"https://skunkworksacademy.com/plans-and-purchases/\"", "Connections global menu must link to plans and purchases.");
must("connections/index.html", connections, "href=\"https://portal.skunkworksacademy.com/reports/\"", "Connections global menu must link to reports.");
must("connections/index.html", connections, "href=\"./assets/styles.css\"", "Connections stylesheet must be loaded.");
must("connections/index.html", connections, "src=\"./assets/app.js\"", "Connections interaction module must be loaded.");
must("connections/index.html", connections, "id=\"connectionSearch\"", "search interface is required.");
must("connections/index.html", connections, "id=\"connectionPlanner\"", "connection brief planner is required.");
must("connections/index.html", connections, "id=\"savedConnections\"", "saved pathway interface is required.");
must("connections/assets/styles.css", connectionsCss, "--ink-navy:#03033A", "canonical Ink Navy token is required.");
must("connections/assets/styles.css", connectionsCss, "--skunk-blue:#1E6BD0", "canonical Skunk Blue token is required.");
must("connections/assets/styles.css", connectionsCss, ".top[data-fallback-header=\"true\"]", "Connections topbar styling is required.");
must("connections/assets/styles.css", connectionsCss, ".top.global-menu-open .links", "Connections flyout open state is required.");
must("connections/assets/app.js", connectionsJs, "const pathways = [", "connection pathway catalogue is required.");
must("connections/assets/app.js", connectionsJs, "swa.connections.saved.v1", "saved pathway storage is required.");
must("connections/assets/app.js", connectionsJs, "function updateResults()", "search and filter behaviour is required.");
must("connections/assets/app.js", connectionsJs, "function buildBrief()", "connection brief generation is required.");

if ((connections.match(/<header\b/g) ?? []).length !== 1) failures.push("connections/index.html: exactly one topbar/header is permitted.");
if (connections.includes("class=\"site-header\"") || connections.includes("class=\"main-nav\"")) failures.push("connections/index.html: deprecated duplicate navigation classes are not permitted.");

if (!/const globalNav = \[[\s\S]*?\] as const;/.test(app)) {
  failures.push("src/App.tsx: globalNav must remain a single const source of truth.");
}

for (const file of walk("src", [".tsx", ".jsx", ".html"], new Set(["src/App.tsx"]))) {
  const content = read(file);
  if (content.includes("Primary portal navigation") || content.includes("className=\"links\"") || content.includes("class=\"links\"")) {
    failures.push(`${file}: duplicate global navigation markup is not allowed.`);
  }
}

if (failures.length) {
  console.error("Global navigation prerequisite check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global navigation prerequisite check passed.");
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures: string[] = [];
const canonicalNavigation = "https://skunkworksacademy.com/assets/academy-navigation.js?v=2026.08.14.2";

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

const index = read("index.html");
const app = read("src/App.tsx");
const landing = read("src/landing-page.tsx");
const connections = read("connections/index.html");
const connectionsCss = read("connections/assets/styles.css");
const connectionsJs = read("connections/assets/app.js");
const pkg = read("package.json");

must("index.html", index, canonicalNavigation, "canonical Academy navigation loader is required.");
must("src/App.tsx", app, "SKUNKWORKS_ACADEMY_NAV_ACCOUNT", "portal account integration for the central menu is required.");
must("src/App.tsx", app, "skunkworksacademy:account-change", "portal account-change event is required.");
must("src/App.tsx", app, 'signInLabel: "Sign in"', "central sign-in label is required.");
must("src/App.tsx", app, 'signOutLabel: "Sign out"', "central sign-out label is required.");
must("package.json", pkg, "\"validate:global-nav\": \"tsx scripts/validate-global-navigation.ts\"", "package must expose the global nav validator.");
must("package.json", pkg, "\"prebuild\": \"npm run validate:global-nav\"", "build must fail before deployment when navigation is invalid.");

if (app.includes("function GlobalHeader") || app.includes("<GlobalHeader") || app.includes('className="top" data-fallback-header="true"')) {
  failures.push("src/App.tsx: page-local global header must not duplicate the canonical menu.");
}
if (landing.includes('className="landing-nav"')) {
  failures.push("src/landing-page.tsx: landing-page global header must not duplicate the canonical menu.");
}

// The contextual student workspace navigation is intentionally separate from the Academy-wide menu.
for (const file of walk("src", [".tsx", ".jsx", ".html"], new Set(["src/App.tsx", "src/landing-page.tsx"]))) {
  const content = read(file);
  if (content.includes("Primary portal navigation") || content.includes('className="links"') || content.includes('class="links"')) {
    failures.push(`${file}: duplicate Academy navigation markup is not allowed.`);
  }
}

// Connections is a separate Vite entry and keeps the same accessible flyout contract.
must("connections/index.html", connections, 'class="top" data-fallback-header="true"', "canonical global topbar is required.");
must("connections/index.html", connections, 'class="global-menu-toggle"', "accessible global menu toggle is required.");
must("connections/index.html", connections, 'class="links" id="primary-portal-navigation"', "global navigation flyout is required.");
must("connections/index.html", connections, 'aria-label="Primary portal navigation"', "global navigation must have its canonical accessible label.");
must("connections/index.html", connections, "https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png", "Connections must use the current light-scheme Academy icon.");
must("connections/index.html", connections, "https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-white.png", "Connections must use the current dark-scheme Academy icon.");
must("connections/index.html", connections, 'href="https://skunkworksacademy.com/catalogue/"', "Connections global menu must link to the current catalogue.");
must("connections/index.html", connections, 'href="https://skunkworksacademy.com/plans-and-purchases/"', "Connections global menu must link to plans and purchases.");
must("connections/index.html", connections, 'href="https://portal.skunkworksacademy.com/reports/"', "Connections global menu must link to reports.");
must("connections/index.html", connections, 'href="./assets/styles.css"', "Connections stylesheet must be loaded.");
must("connections/index.html", connections, 'src="./assets/app.js"', "Connections interaction module must be loaded.");
must("connections/index.html", connections, 'id="connectionSearch"', "search interface is required.");
must("connections/index.html", connections, 'id="connectionPlanner"', "connection brief planner is required.");
must("connections/index.html", connections, 'id="savedConnections"', "saved pathway interface is required.");
must("connections/assets/styles.css", connectionsCss, "--ink-navy:#03033A", "canonical Ink Navy token is required.");
must("connections/assets/styles.css", connectionsCss, "--skunk-blue:#1E6BD0", "canonical Skunk Blue token is required.");
must("connections/assets/styles.css", connectionsCss, '.top[data-fallback-header="true"]', "Connections topbar styling is required.");
must("connections/assets/styles.css", connectionsCss, ".top.global-menu-open .links", "Connections flyout open state is required.");
must("connections/assets/app.js", connectionsJs, "const pathways = [", "connection pathway catalogue is required.");
must("connections/assets/app.js", connectionsJs, "swa.connections.saved.v1", "saved pathway storage is required.");
must("connections/assets/app.js", connectionsJs, "function updateResults()", "search and filter behaviour is required.");
must("connections/assets/app.js", connectionsJs, "function buildBrief()", "connection brief generation is required.");

if ((connections.match(/<header\b/g) ?? []).length !== 1) failures.push("connections/index.html: exactly one topbar/header is permitted.");
if (connections.includes('class="site-header"') || connections.includes('class="main-nav"')) failures.push("connections/index.html: deprecated duplicate navigation classes are not permitted.");

if (failures.length) {
  console.error("Global navigation prerequisite check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global navigation prerequisite check passed.");

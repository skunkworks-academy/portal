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

function requireIncludes(file: string, content: string, expected: string, message: string) {
  if (!content.includes(expected)) {
    failures.push(`${file}: ${message}`);
  }
}

function requireMatch(file: string, content: string, pattern: RegExp, message: string) {
  if (!pattern.test(content)) {
    failures.push(`${file}: ${message}`);
  }
}

function walkFiles(dir: string, extensions: Set<string>, ignored = new Set<string>()) {
  const base = join(root, dir);
  const files: string[] = [];
  if (!existsSync(base)) return files;

  for (const item of readdirSync(base)) {
    const absolute = join(base, item);
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (ignored.has(rel) || item === "node_modules" || item === "dist" || item === ".git" || item === "api-dist") continue;
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...walkFiles(rel, extensions, ignored));
    else if ([...extensions].some((extension) => rel.endsWith(extension))) files.push(rel);
  }

  return files;
}

const app = read("src/App.tsx");
const main = read("src/main.tsx");
const css = read("src/global-nav-compat.css");
const toggle = read("src/global-nav-toggle.ts");
const packageJson = read("package.json");
const pagesWorkflow = read(".github/workflows/pages.yml");

requireIncludes("src/App.tsx", app, "const BRAND_ICON_BLACK = \"https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-black.png\";", "brand must use the approved black favicon asset.");
requireIncludes("src/App.tsx", app, "const BRAND_ICON_WHITE = \"https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-white.png\";", "brand must use the approved white favicon asset.");
requireIncludes("src/App.tsx", app, "const HOME_URL = \"https://skunkworksacademy.com/\";", "brand home URL must point to skunkworksacademy.com.");
requireIncludes("src/App.tsx", app, "className=\"brand\" href={HOME_URL} aria-label=\"Skunkworks Academy home\"", "brand anchor must remain the canonical global header anchor.");
requireIncludes("src/App.tsx", app, "className=\"brand-logo logo-light\" src={BRAND_ICON_BLACK}", "brand must render the light-mode logo image with the canonical class.");
requireIncludes("src/App.tsx", app, "className=\"brand-logo logo-dark\" src={BRAND_ICON_WHITE}", "brand must render the dark-mode logo image with the canonical class.");
requireIncludes("src/App.tsx", app, "Skunkworks Academy <span className=\"brand-section\">{eyebrow}</span>", "brand text must remain Skunkworks Academy plus the current section label.");

const expectedGlobalNav = [
  ["Home", "HOME_URL"],
  ["Self-paced", "https://skunkworksacademy.com/self-paced/"],
  ["Portal", "PORTAL_URL"],
  ["Labs", "https://labs.skunkworksacademy.com/"],
  ["Plans", "https://skunkworksacademy.com/subscriptions/#pricing"],
  ["Purchase", "https://skunkworksacademy.com/subscriptions/#purchasing"]
] as const;

for (const [label, href] of expectedGlobalNav) {
  if (href === "HOME_URL" || href === "PORTAL_URL") {
    requireIncludes("src/App.tsx", app, `{ label: \"${label}\", href: ${href} }`, `global navigation must include ${label} mapped to ${href}.`);
  } else {
    requireIncludes("src/App.tsx", app, `{ label: \"${label}\", href: \"${href}\" }`, `global navigation must include ${label} mapped to ${href}.`);
  }
}

requireIncludes("src/App.tsx", app, "<nav className=\"links\" aria-label=\"Primary portal navigation\">", "global navigation must use the canonical links nav element.");
requireIncludes("src/App.tsx", app, "className=\"nav-action microsoft-signin\"", "Microsoft sign-in button must stay inside the global nav menu.");
requireIncludes("src/main.tsx", main, "import \"./global-nav-toggle\";", "main entrypoint must load the global burger-menu toggle.");
requireIncludes("src/global-nav-toggle.ts", toggle, "const NAV_SELECTOR = 'nav.links[aria-label=\"Primary portal navigation\"]';", "toggle must target only the canonical global nav.");
requireIncludes("src/global-nav-toggle.ts", toggle, "const TOGGLE_CLASS = 'global-menu-toggle';", "toggle must create the canonical burger button class.");
requireIncludes("src/global-nav-toggle.ts", toggle, "brand.insertAdjacentElement('afterend', toggle);", "burger button must sit directly after the brand anchor.");
requireIncludes("src/global-nav-compat.css", css, ".top[data-fallback-header=\"true\"]:not(.global-menu-open) .links", "links must be hidden until the burger menu is opened.");
requireIncludes("src/global-nav-compat.css", css, ".top[data-fallback-header=\"true" + "\"].global-menu-open .links", "links must render only when the burger menu is open.");
requireIncludes("src/global-nav-compat.css", css, ".global-menu-toggle", "burger menu button styling must exist.");
requireIncludes("package.json", packageJson, "\"validate:global-nav\": \"tsx scripts/validate-global-navigation.ts\"", "package must expose the global navigation validator.");
requireIncludes("package.json", packageJson, "\"prebuild\": \"npm run validate:global-nav\"", "builds must fail before compilation when global nav is not compliant.");
requireIncludes(".github/workflows/pages.yml", pagesWorkflow, "npm run validate:global-nav", "GitHub Pages workflow must run the global navigation prerequisite check.");

requireMatch("src/App.tsx", app, /const globalNav = \[[\s\S]*?\] as const;/, "global navigation must remain a single const source of truth.");

const sourceFiles = walkFiles("src", new Set([".tsx", ".jsx", ".html"]), new Set(["src/App.tsx"]));
for (const file of sourceFiles) {
  const content = read(file);
  if (content.includes("Primary portal navigation") || content.includes("className=\"links\"") || content.includes("class=\"links\"")) {
    failures.push(`${file}: duplicate global navigation markup is not allowed; use the App.tsx GlobalHeader source of truth.`);
  }
}

if (failures.length > 0) {
  console.error("Global navigation prerequisite check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global navigation prerequisite check passed.");

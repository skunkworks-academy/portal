import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    failures.push(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

function must(file, content, expected, reason) {
  if (!content.includes(expected)) failures.push(`${file}: ${reason}`);
}

function walk(dir, extensions, ignored = new Set()) {
  const base = join(root, dir);
  const files = [];
  if (!existsSync(base)) return files;

  for (const item of readdirSync(base)) {
    const absolute = join(base, item);
    const rel = relative(root, absolute).replaceAll('\\', '/');
    if (ignored.has(rel) || ['node_modules', 'dist', '.git', 'api-dist'].includes(item)) continue;
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...walk(rel, extensions, ignored));
    else if (extensions.some((extension) => rel.endsWith(extension))) files.push(rel);
  }

  return files;
}

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const css = read('src/global-nav-compat.css');
const toggle = read('src/global-nav-toggle.ts');
const pkg = read('package.json');

must('src/App.tsx', app, 'const BRAND_ICON_BLACK = "https://skunkworksacademy.com/images/favicon-black.png";', 'approved black brand icon is required.');
must('src/App.tsx', app, 'const BRAND_ICON_WHITE = "https://skunkworksacademy.com/images/favicon-white.png";', 'approved white brand icon is required.');
must('src/App.tsx', app, 'const HOME_URL = "https://skunkworksacademy.com/";', 'home URL must be the canonical academy domain.');
must('src/App.tsx', app, 'className="brand" href={HOME_URL} aria-label="Skunkworks Academy home"', 'canonical brand anchor is required.');
must('src/App.tsx', app, 'className="brand-logo logo-light" src={BRAND_ICON_BLACK}', 'light logo image is required.');
must('src/App.tsx', app, 'className="brand-logo logo-dark" src={BRAND_ICON_WHITE}', 'dark logo image is required.');
must('src/App.tsx', app, 'Skunkworks Academy <span className="brand-section">{eyebrow}</span>', 'brand text must stay uniform.');

const navItems = [
  ['Home', 'HOME_URL'],
  ['Self-paced', 'https://skunkworksacademy.com/self-paced/'],
  ['Portal', 'PORTAL_URL'],
  ['Labs', 'https://labs.skunkworksacademy.com/'],
  ['Plans', 'https://skunkworksacademy.com/subscriptions/#pricing'],
  ['Purchase', 'https://skunkworksacademy.com/subscriptions/#purchasing']
];

for (const [label, href] of navItems) {
  const expected = href.endsWith('_URL') ? `{ label: "${label}", href: ${href} }` : `{ label: "${label}", href: "${href}" }`;
  must('src/App.tsx', app, expected, `global nav item missing: ${label}.`);
}

must('src/App.tsx', app, '<nav className="links" aria-label="Primary portal navigation">', 'canonical hidden links nav is required.');
must('src/App.tsx', app, 'className="nav-action microsoft-signin"', 'Microsoft sign-in action must stay inside the hidden nav.');
must('src/main.tsx', main, 'import "./global-nav-toggle";', 'entrypoint must load the burger toggle.');
must('src/global-nav-toggle.ts', toggle, 'global-menu-toggle', 'burger toggle class is required.');
must('src/global-nav-toggle.ts', toggle, 'brand.insertAdjacentElement', 'burger must be inserted after the brand.');
must('src/global-nav-compat.css', css, ':not(.global-menu-open) .links', 'links must be hidden until the burger is opened.');
must('src/global-nav-compat.css', css, '.global-menu-open .links', 'links must render when the burger is opened.');
must('src/global-nav-compat.css', css, '.global-menu-toggle', 'burger styling is required.');
must('package.json', pkg, '"validate:global-nav": "node scripts/validate-global-navigation.mjs"', 'package must expose the global nav validator.');
must('package.json', pkg, '"prebuild": "npm run validate:global-nav"', 'build must fail before deployment when nav is invalid.');

if (!/const globalNav = \[[\s\S]*?\] as const;/.test(app)) {
  failures.push('src/App.tsx: globalNav must remain a single const source of truth.');
}

for (const file of walk('src', ['.tsx', '.jsx', '.html'], new Set(['src/App.tsx']))) {
  const content = read(file);
  if (content.includes('Primary portal navigation') || content.includes('className="links"') || content.includes('class="links"')) {
    failures.push(`${file}: duplicate global navigation markup is not allowed.`);
  }
}

if (failures.length) {
  console.error('Global navigation prerequisite check failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Global navigation prerequisite check passed.');

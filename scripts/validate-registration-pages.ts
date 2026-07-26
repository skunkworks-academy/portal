import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const slugs = [
  "marketing-fundamentals",
  "digital-marketing-strategy",
  "content-marketing-editorial-planning",
  "seo-foundations",
  "social-media-campaign-operations",
  "email-marketing-lifecycle-automation",
  "marketing-analytics-workbook",
  "campaign-planning-toolkit",
  "ai-for-marketing-productivity",
  "landing-pages-conversion-optimisation",
  "marketing-campaign-practitioner",
  "ai-enabled-marketing-operations",
  "exchange-online-bulk-mail-management",
  "ai-tools",
  "cybersecurity",
  "cloud"
];
const errors: string[] = [];

function requireFile(path: string) {
  if (!existsSync(join(root, path))) {
    errors.push(`Missing required file: ${path}`);
  }
}

function requireContent(path: string, text: string, description: string) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    errors.push(`Cannot check missing file: ${path}`);
    return;
  }
  const content = readFileSync(fullPath, "utf8");
  if (!content.includes(text)) {
    errors.push(`Missing expected content in ${path}: ${description}`);
  }
}

requireFile("register/index.html");
requireContent("register/index.html", "data-registration-page=\"generic\"", "generic registration marker is present");
requireContent("register/index.html", "course=", "course query parameter handling exists");
requireContent("register/index.html", "formsubmit.co", "registration form submission route exists");
requireContent("vite.config.ts", "register: resolve(repoRoot, \"register/index.html\")", "generic registration page is part of the Vite build");

for (const slug of slugs) {
  const pagePath = `register/${slug}/index.html`;
  requireFile(pagePath);
  requireContent(pagePath, `data-course-slug=\"${slug}\"`, `registration page marker for ${slug}`);
  requireContent(pagePath, `/register/?course=${slug}`, `redirect URL for ${slug}`);
  requireContent("register/index.html", slug, `generic registration page knows ${slug}`);
  requireContent("vite.config.ts", `register/${slug}/index.html`, `Vite input for ${slug}`);
}

if (new Set(slugs).size !== slugs.length) {
  errors.push("Duplicate course registration slugs detected.");
}

if (errors.length) {
  console.error("Course registration page validation failed.");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Course registration page validation passed for ${slugs.length} registration pages.`);

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = dirname(fileURLToPath(import.meta.url));

const registrationPageSlugs = [
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

const registrationInputs = Object.fromEntries(
  registrationPageSlugs.map((slug) => [`register-${slug}`, resolve(repoRoot, `register/${slug}/index.html`)])
);

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        portal: resolve(repoRoot, "index.html"),
        connections: resolve(repoRoot, "connections/index.html"),
        exchangeOnlineBulkMail: resolve(repoRoot, "courses/exchange-online-bulk-mail-management/index.html"),
        register: resolve(repoRoot, "register/index.html"),
        ...registrationInputs
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:7071"
    }
  }
});

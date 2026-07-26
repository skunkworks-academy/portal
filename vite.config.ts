import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = dirname(fileURLToPath(import.meta.url));

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
        registerMarketingFundamentals: resolve(repoRoot, "register/marketing-fundamentals/index.html"),
        registerDigitalMarketingStrategy: resolve(repoRoot, "register/digital-marketing-strategy/index.html"),
        registerContentMarketingEditorialPlanning: resolve(repoRoot, "register/content-marketing-editorial-planning/index.html"),
        registerSeoFoundations: resolve(repoRoot, "register/seo-foundations/index.html"),
        registerSocialMediaCampaignOperations: resolve(repoRoot, "register/social-media-campaign-operations/index.html"),
        registerEmailMarketingLifecycleAutomation: resolve(repoRoot, "register/email-marketing-lifecycle-automation/index.html"),
        registerMarketingAnalyticsWorkbook: resolve(repoRoot, "register/marketing-analytics-workbook/index.html"),
        registerCampaignPlanningToolkit: resolve(repoRoot, "register/campaign-planning-toolkit/index.html"),
        registerAiForMarketingProductivity: resolve(repoRoot, "register/ai-for-marketing-productivity/index.html"),
        registerLandingPagesConversionOptimisation: resolve(repoRoot, "register/landing-pages-conversion-optimisation/index.html"),
        registerMarketingCampaignPractitioner: resolve(repoRoot, "register/marketing-campaign-practitioner/index.html"),
        registerAiEnabledMarketingOperations: resolve(repoRoot, "register/ai-enabled-marketing-operations/index.html"),
        registerExchangeOnlineBulkMailManagement: resolve(repoRoot, "register/exchange-online-bulk-mail-management/index.html"),
        registerAiTools: resolve(repoRoot, "register/ai-tools/index.html"),
        registerCybersecurity: resolve(repoRoot, "register/cybersecurity/index.html"),
        registerCloud: resolve(repoRoot, "register/cloud/index.html")
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

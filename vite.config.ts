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
        exchangeOnlineBulkMail: resolve(repoRoot, "courses/exchange-online-bulk-mail-management/index.html")
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

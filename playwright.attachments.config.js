import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
export default defineConfig({
  ...base,
  testDir: "./e2e-storage",
  outputDir: "test-results-storage",
  use: { ...base.use, baseURL: "http://127.0.0.1:5181" },
  webServer: {
    ...base.webServer,
    command: "npm run dev -- --port 5181 --strictPort",
    url: "http://127.0.0.1:5181",
    env: {
      VITE_SUPABASE_URL: "https://ghaith-attachments.test",
      VITE_SUPABASE_ANON_KEY: "public-fixture-key",
    },
  },
});

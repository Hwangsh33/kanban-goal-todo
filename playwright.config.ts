import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL } from "./e2e/port";

// `npm run test:e2e` builds the app first; e2e/global-setup.ts starts an in-memory MongoDB, a mock
// GitHub OAuth server and `next start` wired to both, and stops them afterwards.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

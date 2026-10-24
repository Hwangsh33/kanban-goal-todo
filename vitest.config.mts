import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${import.meta.dirname}/` }],
  },
  test: {
    // CI/gate runs get timestamp-free per-test output so failure signatures stay stable
    reporters: process.env.CI ? ["tap-flat"] : ["default"],
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});

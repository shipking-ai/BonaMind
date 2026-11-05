import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The Vite dev server compiles routes on demand. On a cold cache a single
  // landing-page navigation can take 20-25s locally, so the old 30s test
  // budget left no room for assertions. CI runs against a warm cache and
  // keeps its retries.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Two workers against one dev server contend for the same compiler and
  // produce navigation timeouts on slower machines. Serialise locally; CI
  // keeps Playwright's default worker count.
  workers: process.env.CI ? undefined : 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3001",
    port: 3001,
    reuseExistingServer: true,
    timeout: 30_000,
    // The API dev server owns 3001 when it runs; the e2e web server also uses
    // 3001, so without this override Vite proxies /api to itself and every
    // subscription call fails with EADDRINUSE/502. Seeded specs expect the
    // API on 3002 (see HANDOFF); public specs don't call it.
    env: {
      VITE_API_PROXY_TARGET: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3002",
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // No webServer: we inject the bundle into about:blank
  // use: {
  //   //headless: true,          // redundant, but explicit
  //   trace: 'on-first-retry'
  // },

  use: { video: "on", trace: "on" },

  globalSetup: "./playwright.global.mjs",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PITNOW_E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 14 Pro Max"],
        browserName: "chromium",
      },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: "authenticated-mobile-chromium",
      use: {
        ...devices["iPhone 14 Pro Max"],
        browserName: "chromium",
      },
      testMatch: /authenticated-user\.spec\.ts/,
    },
    {
      name: "admin-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
      testMatch: /admin\.spec\.ts/,
    },
  ],
});

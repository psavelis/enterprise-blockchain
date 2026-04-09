import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for the Enterprise Blockchain Demo.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",

  /* Run tests in files in parallel - disabled for stability with session-based flows */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI for stability */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never" }],
        ["json", { outputFile: "e2e-results.json" }],
      ]
    : [["list"], ["html", { open: "on-failure" }]],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video recording on failure */
    video: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    /* Test against mobile viewports */
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  /* Timeout for each test - increased for settlement flows */
  timeout: 90_000,

  /* Timeout for expect assertions */
  expect: {
    timeout: 10_000,
  },

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

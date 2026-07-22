import { defineConfig, devices } from "@playwright/test";

/**
 * Demo-mode smoke tests. They run against a production build (`next start`)
 * so console noise from dev overlays does not pollute the console-error check.
 * Run `npm run e2e` to build + test in one step.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // A narrow Chromium viewport rather than a touch-emulated device profile
    // (devices["Pixel 5"], etc.) — touch/device emulation interacted badly
    // with in-test viewport resizing, and the app has no separate
    // touch-vs-mouse code paths that need real device emulation to exercise.
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

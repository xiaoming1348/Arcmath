import path from "node:path";
import { defineConfig, devices } from "playwright/test";

const repoRoot = path.resolve(__dirname, "../..");
const webServerCommand =
  "sh ./scripts/with-env-local.sh pnpm -C apps/web exec next dev --webpack --hostname 127.0.0.1 --port 3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: process.env.CI ? [["list"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: webServerCommand,
    url: "http://localhost:3000",
    cwd: repoRoot,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});

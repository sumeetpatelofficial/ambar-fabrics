import { defineConfig } from "@playwright/test"

const port = 3100

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  // Throwaway database + production build (see scripts/e2e-server.ts). Reused locally when already running.
  webServer: {
    command: "pnpm exec tsx --conditions=react-server scripts/e2e-server.ts",
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
  },
})

import { defineConfig, devices } from '@playwright/test';

const rootDir = __dirname;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: true,
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    video: 'on',
    actionTimeout: 5_000,
    ignoreHTTPSErrors: true,
  },

  webServer: {
    command: 'node ./setup/prepare-e2e-slides.mjs && pnpm exec slidev ./slides.e2e.md --port 4173 --remote 127.0.0.1 --bind 127.0.0.1',
    cwd: rootDir,
    url: 'http://localhost:4173',
    timeout: 120_000,
    // Ensure Playwright starts a fresh Slidev server for test runs
    // to avoid flakiness from stale or partially-initialized servers.
    reuseExistingServer: false,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});

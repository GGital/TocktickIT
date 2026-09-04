import { defineConfig, devices } from '@playwright/test'

/**
 * Lab 2 end-to-end configuration (tests.md §2.9, §4.2).
 *
 * Both servers are started by Playwright itself so `npm run e2e` needs nothing
 * running beforehand except PostgreSQL: the API on :3000 and the Vite dev server
 * on :5173, which proxies /api to the API and keeps the browser same-origin.
 */
export default defineConfig({
  testDir: './e2e/lab-02',
  outputDir: './artifacts/lab-02/playwright-output',

  // Every spec talks to one shared database, so they run one at a time. Parallel
  // workers would see each other's tickets and make the list assertions flaky.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: './artifacts/lab-02/playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The documented desktop viewport; the responsive and screenshot specs set
    // their own per test.
    viewport: { width: 1280, height: 800 },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],

  webServer: [
    {
      command: 'npm start --prefix server',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev --prefix client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})

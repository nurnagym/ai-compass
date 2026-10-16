import { defineConfig, devices } from '@playwright/test'
const testOrigin = process.env.COMPASS_TEST_ORIGIN || 'http://127.0.0.1:5173'
const testPort = new URL(testOrigin).port || '5173'
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  use: {
    baseURL: testOrigin,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `npm run dev -- --port ${testPort} --strictPort`,
    url: testOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})

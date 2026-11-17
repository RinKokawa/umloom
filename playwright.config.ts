import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5198',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  webServer: { command: 'npm run dev -- --port 5198 --strictPort', url: 'http://127.0.0.1:5198', reuseExistingServer: true, timeout: 30000 },
})

import { defineConfig } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './scenarios',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // scenarios are sequential chains
  retries: CI ? 1 : 0,
  workers: 1, // single worker — scenarios share a webServer
  reporter: CI ? [['html', { open: 'never' }], ['github']] : [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  webServer: {
    command:
      'VITE_SERVER_PORT=4445 VITE_DEV_PORT=5174 CORS_ORIGIN=http://localhost:5174 DATA_DIR=/tmp/myvtt-e2e npm run dev',
    port: 5174,
    reuseExistingServer: !CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})

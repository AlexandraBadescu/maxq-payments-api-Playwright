import { defineConfig } from '@playwright/test';

const PORT = process.env.PORT ?? '4020';
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/scenarios',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Request-only tests: no browser installation needed.
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/results.xml' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
  ],
  globalSetup: require.resolve('./tests/global-setup'),
  globalTeardown: require.resolve('./tests/global-teardown'),
  use: {
    baseURL,
    extraHTTPHeaders: { 'content-type': 'application/json' },
    trace: 'retain-on-failure',
  },
});

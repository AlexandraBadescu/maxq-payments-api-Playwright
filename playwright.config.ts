import { defineConfig } from '@playwright/test';
import { CAPTURE_TIMEOUT_MS } from './tests/constants';

const PORT = process.env.PORT ?? '4020';
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/scenarios',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  // No retries: a test that fails once should fail the run. A retry that passes would
  // hide exactly the kind of flakiness this suite is meant to rule out.
  retries: 0,
  // Request-only tests: no browser installation needed.
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/results.xml' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
  ],
  // Refuses to run against anything that isn't a local service (see test:guard).
  globalSetup: require.resolve('./tests/global-setup'),
  // Starts the demo service, waits for /health, shows its output and stops it afterwards.
  // If the port is already in use the run refuses to start (reuseExistingServer: false),
  // so the suite can never silently test a different service.
  // Set BASE_URL to use a service you started yourself.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node src/server.js --simulator',
        url: `http://127.0.0.1:${PORT}/health`,
        reuseExistingServer: false,
        timeout: 10_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...(process.env as Record<string, string>),
          PORT,
          CAPTURE_TIMEOUT_MS: String(CAPTURE_TIMEOUT_MS),
        },
      },
  use: {
    baseURL,
    extraHTTPHeaders: { 'content-type': 'application/json' },
    trace: 'retain-on-failure',
  },
});

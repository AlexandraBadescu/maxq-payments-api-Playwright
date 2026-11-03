// Payment tests should never run against a remote API.
// test:guard verifies that a non-local BASE_URL is rejected before any request.
// (Starting and stopping the service is handled by `webServer` in playwright.config.ts.)
export default async function globalSetup(): Promise<void> {
  const override = process.env.BASE_URL;
  if (!override) return;
  const host = new URL(override).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Refusing to run: BASE_URL "${override}" is not localhost or 127.0.0.1.`,
    );
  }
}

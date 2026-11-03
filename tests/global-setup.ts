import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { CAPTURE_TIMEOUT_MS } from './constants';

const ROOT = path.resolve(__dirname, '..');
const PIDFILE = path.join(ROOT, '.pw-server.pid');
const PORT = process.env.PORT ?? '4020';

// Payment tests should never run against a remote API.
// test:guard verifies that a non-local BASE_URL is rejected before any request.
function guardBaseUrl(): void {
  const override = process.env.BASE_URL;
  if (!override) return;
  const host = new URL(override).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Refusing to run: BASE_URL "${override}" is not localhost or 127.0.0.1.`,
    );
  }
}

async function waitForHealth(url: string, attempts = 30, intervalMs = 200): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not listening yet — try again.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`The service never became healthy at ${url}`);
}

// Fail early if another process is already listening on the test port.
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

export default async function globalSetup(): Promise<void> {
  guardBaseUrl();

  if (process.env.BASE_URL) {
    // An explicitly configured local service is managed outside this suite.
    return;
  }

  const portNumber = Number(PORT);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error(`Invalid test server PORT: ${PORT}`);
  }
  if (await portInUse(portNumber)) {
    throw new Error(`Port ${PORT} is already in use. Set PORT to another local port, or start the service yourself and set BASE_URL.`);
  }

  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
    env: {
      ...process.env,
      PORT,
      CAPTURE_TIMEOUT_MS: String(CAPTURE_TIMEOUT_MS),
    },
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  fs.writeFileSync(PIDFILE, String(child.pid));

  await waitForHealth(`http://127.0.0.1:${PORT}/health`);
}

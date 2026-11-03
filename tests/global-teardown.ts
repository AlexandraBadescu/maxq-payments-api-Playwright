import fs from 'node:fs';
import path from 'node:path';

const PIDFILE = path.join(__dirname, '..', '.pw-server.pid');

export default async function globalTeardown(): Promise<void> {
  if (process.env.BASE_URL) return; // We didn't start a server, so there's nothing to stop.
  if (!fs.existsSync(PIDFILE)) return;

  const pid = Number(fs.readFileSync(PIDFILE, 'utf8'));
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
  fs.unlinkSync(PIDFILE);
}

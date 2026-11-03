'use strict';

// Attempt a run against a non-localhost loopback address.
// The guard must reject it before sending any requests.
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  let requestsReceived = 0;
  const server = http.createServer((_req, res) => {
    requestsReceived += 1;
    res.end('{}');
  });
  // 127.0.0.2 reaches this machine, but it isn't localhost or 127.0.0.1, so
  // the guard in global-setup.ts must refuse to run against it.
  await new Promise((resolve) => server.listen(0, '127.0.0.2', resolve));
  const port = server.address().port;

  const result = spawnSync('npx', ['playwright', 'test'], {
    cwd: ROOT,
    env: { ...process.env, BASE_URL: `http://127.0.0.2:${port}` },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  server.close();

  // Playwright prints a globalSetup error to stdout, not stderr.
  const output = (result.stdout ? result.stdout.toString() : '') + (result.stderr ? result.stderr.toString() : '');
  const refused = result.status !== 0;
  const guardFired = output.includes('Refusing to run');
  const passed = requestsReceived === 0 && refused && guardFired;

  console.log(`Requests that reached the service: ${requestsReceived}`);
  console.log(`Run refused: ${refused}`);
  console.log(`Guard message seen in output: ${guardFired}`);
  console.log(passed ? 'PASS  The guard blocked the run.' : 'FAIL  The guard did not do its job.');
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

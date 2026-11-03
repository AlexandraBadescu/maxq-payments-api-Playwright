'use strict';

// Run scenario files individually to catch accidental dependencies
// on data created by previous tests.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCENARIOS_DIR = path.join(ROOT, 'tests', 'scenarios');
const RESULTS_FILE = path.join(ROOT, 'reports', 'results.json');

function main() {
  const files = fs
    .readdirSync(SCENARIOS_DIR)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();

  let failed = 0;
  for (const file of files) {
    const result = spawnSync('npx', ['playwright', 'test', path.join('tests', 'scenarios', file)], {
      cwd: ROOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    const report = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const tests = report.stats?.expected ?? 0;
    const ok = result.status === 0 && tests > 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${file} (${tests} test${tests === 1 ? '' : 's'})`);
    if (!ok) failed += 1;
  }

  console.log(`\n${failed === 0 ? 'All scenarios pass on their own.' : `${failed} failed.`}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();

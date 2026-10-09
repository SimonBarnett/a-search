'use strict';

/**
 * Cross-platform npm test entry (FR-139 / MRB #1151).
 * A quoted tests glob is a literal path on Linux GitHub Actions.
 * Walk tests/ and invoke node --test in argv-safe batches.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const testsRoot = path.join(root, 'tests');
const BATCH = 40;

function collectTestFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      collectTestFiles(p, out);
    } else if (ent.isFile() && ent.name.endsWith('.test.js')) {
      out.push(p);
    }
  }
  return out;
}

const files = collectTestFiles(testsRoot).sort();
if (files.length < 1) {
  console.error('run-tests: no *.test.js under tests/');
  process.exit(1);
}

let failed = 0;
for (let i = 0; i < files.length; i += BATCH) {
  const chunk = files.slice(i, i + BATCH);
  const result = spawnSync(process.execPath, ['--test', ...chunk], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  if (result.status !== 0) {
    failed = result.status === null ? 1 : result.status;
    break;
  }
}
process.exit(failed);

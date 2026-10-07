'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

describe('FR-023 CDK skeleton', () => {
  it('stack source has entry + amazon live/sandbox queue names', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /a-search-amazon-live/);
    assert.match(text, /a-search-amazon-sandbox/);
    assert.match(text, /EntryFunction|a-search-entry/);
    assert.match(text, /NODEJS_20/);
  });

  it('npm run synth exits 0', () => {
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'synth'],
      { cwd: root, encoding: 'utf8', shell: true, timeout: 120_000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});

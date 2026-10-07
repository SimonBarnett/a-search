'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

describe('MRB #73 hostile: FR-023 CDK skeleton', () => {
  it('queue names match queueName.js pattern; entry Lambda present', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /a-search-amazon-live/);
    assert.match(text, /a-search-amazon-sandbox/);
    assert.match(text, /a-search-entry|EntryFunction/);
    const { queueName } = require('../providers/queueName');
    assert.equal(queueName('amazon', 'live'), 'a-search-amazon-live');
    assert.equal(queueName('amazon', 'sandbox'), 'a-search-amazon-sandbox');
  });

  it('package.json synth uses npx --no-install cdk; npm run synth exits 0', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    assert.match(pkg.scripts.synth, /npx --no-install cdk/);
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.match(gi, /cdk\.out/);
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'synth'],
      { cwd: root, encoding: 'utf8', shell: true, timeout: 180_000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});
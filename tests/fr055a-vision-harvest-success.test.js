'use strict';

/** FR-055a: docs/vision.md Success row for harvest CAST IRON agents */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const vision = path.join(root, 'docs', 'vision.md');

describe('FR-055a vision Success row harvest CAST IRON', () => {
  it('Success table includes S10 harvest CAST IRON row with how-measured', () => {
    assert.ok(fs.existsSync(vision), 'missing docs/vision.md');
    const text = fs.readFileSync(vision, 'utf8');
    assert.match(text, /## Success/);
    assert.match(text, /\|\s*S10\s*\|/);
    assert.match(text, /Harvest CAST IRON/i);
    assert.match(text, /skillbook-harvest\.test\.js/);
    assert.match(text, /\/bob\/v1\/intake|Report-BobiverseIntakeIssue/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /how measured|how-measured/i);
  });

  it('validate-vision-pack.py exits 0 on docs/vision.md', () => {
    const candidates = [
      path.join('C:', 'ai', 'bob', 'plan', 'tools', 'validate-vision-pack.py'),
      path.join(root, 'tools', 'validate-vision-pack.py'),
    ];
    const script = candidates.find((p) => fs.existsSync(p));
    assert.ok(script, 'validate-vision-pack.py not found');

    const pyCandidates = [
      'C:\\Program Files\\Python312\\python.exe',
      'python',
      'py',
    ];
    let result = null;
    for (const py of pyCandidates) {
      result = spawnSync(py, [script, vision], {
        encoding: 'utf8',
        cwd: root,
      });
      if (result.error && result.error.code === 'ENOENT') continue;
      break;
    }
    assert.ok(result, 'python not available');
    assert.equal(
      result.status,
      0,
      `validator failed:\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  });
});

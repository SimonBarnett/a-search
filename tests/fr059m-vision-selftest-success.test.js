'use strict';

/** FR-059m: docs/vision.md Success row for selftest + intake on fail */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const vision = path.join(root, 'docs', 'vision.md');

describe('FR-059m vision Success row selftest + intake on fail', () => {
  it('Success table includes S19 selftest / intake row with how-measured', () => {
    assert.ok(fs.existsSync(vision), 'missing docs/vision.md');
    const text = fs.readFileSync(vision, 'utf8');
    assert.match(text, /## Success/);
    assert.match(text, /\|\s*S19\s*\|/);
    assert.match(text, /selftest/i);
    assert.match(text, /intake/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(
      text,
      /endpoint-selftest\.md|FR-059|fr059a-endpoint-selftest/i,
    );
    assert.match(text, /fail-when|never POST|ignores JWT|Selftest missing/i);
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

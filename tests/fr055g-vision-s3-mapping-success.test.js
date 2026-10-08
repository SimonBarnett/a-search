'use strict';

/** FR-055g: docs/vision.md Success row for durable S3 mapping service */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const vision = path.join(root, 'docs', 'vision.md');

describe('FR-055g vision Success row S3 mapping service', () => {
  it('Success table includes S16 S3 mapping row with how-measured', () => {
    assert.ok(fs.existsSync(vision), 'missing docs/vision.md');
    const text = fs.readFileSync(vision, 'utf8');
    assert.match(text, /## Success/);
    assert.match(text, /\|\s*S16\s*\|/);
    assert.match(text, /Persist local S3 mapping|S3 mapping|_mapping/i);
    assert.match(text, /upsert|mapping/i);
    assert.match(
      text,
      /fr054b-mapping-upsert-get\.test\.js|FR-054|s3-mapping\.md/,
    );
    assert.match(text, /memory|lost across invokes/i);
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

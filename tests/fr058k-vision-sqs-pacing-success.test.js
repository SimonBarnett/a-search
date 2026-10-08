'use strict';

/** FR-058k: docs/vision.md Success row for SQS pacing vs provider 407/429 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const vision = path.join(root, 'docs', 'vision.md');

describe('FR-058k vision Success row SQS pacing vs 407/429', () => {
  it('Success table includes S18 paced SQS / 407-429 row with how-measured', () => {
    assert.ok(fs.existsSync(vision), 'missing docs/vision.md');
    const text = fs.readFileSync(vision, 'utf8');
    assert.match(text, /## Success/);
    assert.match(text, /\|\s*S18\s*\|/);
    assert.match(text, /paced SQS|SQS pacing|maxConcurrency/i);
    assert.match(text, /407|429/);
    assert.match(
      text,
      /sqs-pacing\.md|FR-058|fr058a-sqs-pacing|max-concurrency/i,
    );
    assert.match(text, /fail-when|unbounded|Sustained|batchSize/i);
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

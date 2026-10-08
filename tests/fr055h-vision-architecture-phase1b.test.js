'use strict';

/** FR-055h: vision Architecture ASCII mentions Phase 1b surfaces */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const vision = path.join(root, 'docs', 'vision.md');

function architectureFence(text) {
  const start = text.indexOf('## Architecture');
  assert.ok(start >= 0, 'missing ## Architecture');
  const locked = text.indexOf('\nLOCKED\n', start);
  assert.ok(locked > start, 'missing LOCKED after Architecture');
  return text.slice(start, locked);
}

describe('FR-055h vision Architecture Phase 1b surfaces', () => {
  it('Architecture diagram mentions performance + onboarding (+ shared/intake)', () => {
    const text = fs.readFileSync(vision, 'utf8');
    const arch = architectureFence(text);
    assert.match(arch, /```/);
    assert.match(arch, /\/account\/performance|performance/i);
    assert.match(arch, /onboarding/i);
    assert.match(arch, /shared\//i);
    assert.match(arch, /intake/i);
    assert.match(arch, /_mapping|mapping/i);
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

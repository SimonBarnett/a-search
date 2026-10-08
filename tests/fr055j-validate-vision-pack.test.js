'use strict';

/**
 * FR-055j: validate-vision-pack.py exits 0 after Phase 1b docs (S10–S16).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const vision = path.join(root, 'docs', 'vision.md');

function findValidator() {
  const candidates = [
    process.env.VALIDATE_VISION_PACK,
    path.join('C:', 'ai', 'bob', 'plan', 'tools', 'validate-vision-pack.py'),
    path.join(root, 'tools', 'validate-vision-pack.py'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

describe('FR-055j validate-vision-pack after Phase 1b docs', () => {
  it('vision Success table still has Phase 1b rows S10–S16', () => {
    const text = fs.readFileSync(vision, 'utf8');
    assert.match(text, /## Success/);
    for (const id of ['S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16']) {
      assert.match(text, new RegExp(`\\|\\s*${id}\\s*\\|`), `missing Success row ${id}`);
    }
  });

  it('validate-vision-pack.py exits 0 on docs/vision.md', () => {
    const script = findValidator();
    assert.ok(
      script,
      'validate-vision-pack.py not found (set VALIDATE_VISION_PACK or install under C:\\ai\\bob\\plan\\tools)',
    );

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

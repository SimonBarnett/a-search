'use strict';

/**
 * MRB #5351 hostile: FR #5325 evidence boxes without cutting a tag; ASCII checklist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CHECKLIST = path.join(ROOT, 'docs', 'release-checklist.md');
const CI = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const PIN = path.join(ROOT, 'tests', 'fr5325-release-checklist-evidence.test.js');

function readUtf8NoBom(p) {
  const raw = fs.readFileSync(p);
  assert.notEqual(raw[0], 0xef, path.basename(p) + ' must be UTF-8 without BOM');
  for (let i = 0; i < raw.length; i++) {
    assert.ok(raw[i] < 128, path.basename(p) + ' must stay ASCII (byte ' + raw[i] + ' at ' + i + ')');
  }
  return raw.toString('utf8');
}

describe('MRB #5351 hostile FR #5325 checklist evidence', () => {
  it('implementer pin + ASCII checklist; secrets/stay-dark unchecked', () => {
    assert.ok(fs.existsSync(PIN), 'missing tests/fr5325-release-checklist-evidence.test.js');
    const text = readUtf8NoBom(CHECKLIST);
    assert.match(text, /- \[x\].*VERSION/i);
    assert.match(text, /- \[x\].*package\.json/i);
    assert.match(text, /- \[x\].*test-and-synth/i);
    assert.match(text, /- \[ \] Secrets stay out of git/i);
    assert.match(text, /- \[ \] .*(Stay-dark|Hold-dark)/i);
    assert.match(text, /Do \*\*not\*\* cut the tag from FR #5325/i);
    const ci = fs.readFileSync(CI, 'utf8');
    assert.match(ci, /test-and-synth:/);
  });

  it('tip does not change VERSION or package.json vs origin/main', () => {
    const r = spawnSync(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr || 'git diff failed');
    const names = r.stdout.split(/\r?\n/).filter(Boolean);
    assert.ok(!names.includes('VERSION'), names.join(','));
    assert.ok(!names.includes('package.json'), names.join(','));
  });
});

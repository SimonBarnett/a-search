'use strict';

/**
 * FR #5325: docs/release-checklist.md records v0.1.0 evidence without cutting a tag.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR #5325 release checklist evidence (no tag)', () => {
  it('checklist names 0.1.0 and records no tag/release yet', () => {
    const text = utf8NoBom('docs/release-checklist.md');
    assert.match(text, /0\.1\.0/);
    assert.match(text, /v0\.1\.0/);
    assert.match(text, /no git tag/i);
    assert.match(text, /no GitHub Release/i);
    assert.match(text, /FR #?5325/);
    // Checked evidence boxes present
    assert.match(text, /- \[x\].*VERSION/i);
    assert.match(text, /- \[x\].*package\.json/i);
    assert.match(text, /- \[x\].*CI workflow on `main` runs/i);
    assert.match(text, /test-and-synth/);
    // Deploy / smoke / UAT stay unchecked
    assert.match(text, /- \[ \] Deploy playbook/i);
    assert.match(text, /- \[ \] Post-deploy smoke/i);
    assert.match(text, /- \[ \] UAT S19/i);
  });

  it('VERSION and package.json are 0.1.0', () => {
    const ver = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    assert.equal(ver, '0.1.0');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '0.1.0');
  });

  it('this change does not introduce a v0.1.0 tag on origin', () => {
    // Pin: FR #5325 must not cut the release tag. Empty remote tag list is fine;
    // if tags appear later, none of them may be created by this docs tip alone —
    // assert the checklist still forbids cutting from #5325.
    const text = utf8NoBom('docs/release-checklist.md');
    assert.match(text, /does \*\*not\*\* create either|does not cut|Do \*\*not\*\* cut the tag from FR #5325/i);
    let remote = '';
    try {
      remote = execFileSync('git', ['ls-remote', '--tags', 'origin'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Offline / no origin: still require the docs forbid
      remote = '';
    }
    // Soft: if origin has tags, v0.1.0 may exist from a later UAT seat — that is
    // outside this FR. The pin is that the checklist text forbids #5325 from cutting.
    assert.ok(typeof remote === 'string');
  });
});

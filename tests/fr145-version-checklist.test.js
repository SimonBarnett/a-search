'use strict';

/**
 * FR-145: VERSION file + docs/release-checklist.md for first installable tag.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const EXPECTED = '0.1.0';

describe('FR-145 VERSION + release checklist', () => {
  it('VERSION file is single-line semver matching package.json', () => {
    const versionPath = path.join(root, 'VERSION');
    assert.ok(fs.existsSync(versionPath), 'VERSION file missing');
    const raw = fs.readFileSync(versionPath);
    assert.notEqual(raw[0], 0xef, 'VERSION must be UTF-8 without BOM');
    const text = raw.toString('utf8').trim();
    assert.equal(text, EXPECTED);
    assert.doesNotMatch(text, /^v/i);
    assert.match(text, /^\d+\.\d+\.\d+$/);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    assert.equal(pkg.version, EXPECTED, 'package.json version must match VERSION');
  });

  it('docs/release-checklist.md covers gates + v0.1.0 tag', () => {
    const checklist = fs.readFileSync(
      path.join(root, 'docs', 'release-checklist.md'),
      'utf8',
    );
    assert.match(checklist, /FR-145/);
    assert.match(checklist, /v0\.1\.0/);
    assert.match(checklist, /npm test|tests green/i);
    assert.match(checklist, /synth/i);
    assert.match(checklist, /deploy\.md|deploy playbook/i);
    assert.match(checklist, /smoke/i);
    assert.match(checklist, /release-installable\.md/);
    assert.match(checklist, /GitHub Release|Plan|UAT/i);
  });

  it('README + DoD + FR-145 Decision LOCKED + release-gap Yes', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /release-checklist\.md/);
    assert.match(readme, /FR-145/);

    const dod = fs.readFileSync(
      path.join(root, 'docs', 'release-installable.md'),
      'utf8',
    );
    assert.match(dod, /release-checklist\.md/);
    assert.match(dod, /FR-145/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-145.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /VERSION/);
    assert.match(fr, /fr145-version-checklist\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*VERSION \+ release checklist\s*\|\s*\*\*Yes\*\*/);
  });
});

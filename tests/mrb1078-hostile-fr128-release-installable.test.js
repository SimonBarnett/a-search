'use strict';

/** docs/mrb-1078: hostile pins for FR-128 AWS installable DoD docs (PR #1078). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1078 hostile FR-128 release-installable DoD', () => {
  it('DoD Success table covers D1-D7 and stays docs-only (no infra claim)', () => {
    const t = read('docs/release-installable.md');
    assert.match(t, /FR-128/);
    assert.match(t, /Definition of Done|v0\.1/i);
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']) {
      assert.match(t, new RegExp(`\\|\\s*${id}\\s*\\|`));
    }
    assert.match(t, /CI|GitHub Actions/);
    assert.match(t, /cdk deploy/);
    assert.match(t, /Secrets Manager|never git/i);
    assert.match(t, /S3_RESULTS_BUCKET/);
    assert.match(t, /smoke/i);
    assert.match(t, /VERSION/);
    assert.match(t, /Stay-dark OOS|stay-dark/i);
    assert.match(t, /does not implement|later FRs/i);
    assert.match(t, /phase3-enable-provider\.md/);
  });

  it('README keeps both FR-126 enable template and FR-128 DoD links', () => {
    const t = read('README.md');
    assert.match(t, /docs\/phase3-enable-provider\.md/);
    assert.match(t, /docs\/release-installable\.md/);
    assert.doesNotMatch(t, /<<<<<<<|=======|>>>>>>>/);
  });

  it('FR-128 park Decision LOCKED + product pin on main', () => {
    const park = read('docs/fr/FR-128.md');
    assert.match(park, /Decision \(LOCKED\)/);
    assert.match(park, /D1-D7|Success table/);
    const pin = path.join(root, 'tests', 'fr128-release-installable-docs.test.js');
    assert.ok(fs.existsSync(pin));
    const pt = fs.readFileSync(pin, 'utf8');
    assert.match(pt, /release-installable\.md/);
    assert.match(pt, /stay-?dark|out of scope/i);
  });

  it('release-gap + phase3-aws-installable umbrellas point at DoD', () => {
    const gap = read('docs/release-gap-aws-installable-2026-10-09.md');
    assert.match(gap, /release-installable\.md/);
    const umb = read('docs/feature-request-phase3-aws-installable-2026-10-09.md');
    assert.match(umb, /release-installable\.md|FR-128/);
  });
});

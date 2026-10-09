'use strict';

/**
 * FR-128: docs/release-installable.md v0.1 AWS installable DoD.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR-128 release-installable DoD docs', () => {
  it('docs/release-installable.md has Success / DoD needles', () => {
    const rel = 'docs/release-installable.md';
    assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
    const text = utf8NoBom(rel);
    assert.match(text, /FR-?128|Definition of Done|v0\.1/i);
    assert.match(text, /Success/i);
    assert.match(text, /npm test|CI|GitHub Actions/i);
    assert.match(text, /npm run synth|synth/i);
    assert.match(text, /cdk deploy|npx cdk deploy/i);
    assert.match(text, /S3|S3_RESULTS_BUCKET/i);
    assert.match(text, /secret|Secrets Manager|JWT/i);
    assert.match(text, /smoke/i);
    assert.match(text, /VERSION/i);
    assert.match(text, /stay-?dark|enabled\.live|out of scope/i);
  });

  it('README Docs index points at release-installable.md', () => {
    const readme = utf8NoBom('README.md');
    assert.match(readme, /docs\/release-installable\.md/);
  });

  it('release-gap companion points at the DoD doc', () => {
    const gap = utf8NoBom('docs/release-gap-aws-installable-2026-10-09.md');
    assert.match(gap, /docs\/release-installable\.md|release-installable\.md/);
  });
});

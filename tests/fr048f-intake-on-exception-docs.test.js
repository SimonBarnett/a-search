'use strict';

/** FR-048f: docs/intake-on-exception.md */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-048f docs/intake-on-exception.md', () => {
  it('doc lists entry, worker, maintainer, onboarding', () => {
    const doc = path.join(root, 'docs', 'intake-on-exception.md');
    assert.ok(fs.existsSync(doc));
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /entry/i);
    assert.match(text, /worker/i);
    assert.match(text, /maintainer/i);
    assert.match(text, /onboarding/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /\/bob\/v1\/intake/);
  });

  it('root README links to docs/intake-on-exception.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/intake-on-exception\.md/);
  });
});

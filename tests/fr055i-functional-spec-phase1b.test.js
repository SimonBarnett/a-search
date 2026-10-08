'use strict';

/** FR-055i: docs/functional-spec.md Phase 1b bullets */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const spec = path.join(root, 'docs', 'functional-spec.md');

describe('FR-055i functional-spec Phase 1b bullets', () => {
  it('Phase 1b section covers harvest, shared, intake, onboarding, performance, mapping', () => {
    assert.ok(fs.existsSync(spec), 'missing docs/functional-spec.md');
    const text = fs.readFileSync(spec, 'utf8');
    assert.match(text, /## Phase 1b/);
    assert.match(text, /Harvest CAST IRON|CAST IRON/i);
    assert.match(text, /Shared layer|shared\//i);
    assert.match(text, /intake/i);
    assert.match(text, /onboarding/i);
    assert.match(text, /Daily report signup|signup/i);
    assert.match(text, /\/account\/performance|Performance endpoint/i);
    assert.match(text, /_mapping|S3 mapping|mapping/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /resultsPath/);
    assert.match(text, /remaining=0/);
  });
});

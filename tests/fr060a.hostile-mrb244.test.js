'use strict';

/** Hostile pins FR-060a / MRB #244 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

describe('hostile MRB #244 FR-060a', () => {
  it('provider-onboarding-skills.md contract path + required sections', () => {
    const t = fs.readFileSync(path.join(root, 'docs', 'provider-onboarding-skills.md'), 'utf8');
    assert.match(t, /a-search-<id>-onboarding/);
    assert.match(t, /providers\/<kind>\/<id>\/\.grok\/skills\/a-search-<id>-onboarding/);
    assert.match(t, /CAST IRON/);
    assert.match(t, /sandbox/i);
    assert.match(t, /selftest/i);
    assert.match(t, /\.env/);
  });
});

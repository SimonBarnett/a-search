'use strict';

/** FR-060a: docs contract for a-search-<id>-onboarding skillbooks */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-060a provider onboarding skillbook docs', () => {
  it('docs/provider-onboarding-skills.md lists a-search-<id>-onboarding path pattern', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'provider-onboarding-skills.md'),
      'utf8',
    );
    assert.match(text, /a-search-<id>-onboarding/);
    assert.match(text, /CAST IRON/);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(
      text,
      /providers\/<kind>\/<id>\/\.grok\/skills\/a-search-<id>-onboarding/,
    );
  });

  it('skillbook-layout.md and add-source.md cite onboarding skillbook', () => {
    const layout = fs.readFileSync(
      path.join(root, 'docs', 'skillbook-layout.md'),
      'utf8',
    );
    const add = fs.readFileSync(path.join(root, 'docs', 'add-source.md'), 'utf8');
    assert.match(layout, /a-search-<id>-onboarding|a-search-amazon-onboarding/);
    assert.match(layout, /provider-onboarding-skills\.md/);
    assert.match(add, /a-search-<id>-onboarding/);
    assert.match(add, /provider-onboarding-skills\.md/);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('docs/mrb-4825 harvest FR #4823', () => {
  it('does not teach empty-product IN writes after FR #4823', () => {
    const t = fs.readFileSync(SKILL, 'utf8');
    assert.match(t, /FR #4823/);
    assert.match(t, /writes no IN file/);
    assert.doesNotMatch(t, /still writes an empty-products IN/);
  });
});

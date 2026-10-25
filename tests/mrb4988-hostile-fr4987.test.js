'use strict';

/**
 * Hostile MRB #4988 / FR #4987: stale S1 JWT GIVEUP lesson must stay gone;
 * CDK+IAM #4881 smoke lesson must stay.
 */

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

describe('MRB #4988 hostile FR #4987', () => {
  it('skill book pins CDK IAM smoke and rejects JWT GIVEUP bullets', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.match(text, /#4888/);
    assert.match(text, /SigV4/);
    assert.match(text, /never a GIVEUP reason/);
    assert.doesNotMatch(text, /deploy-host checklist/);
    assert.doesNotMatch(text, /A_SEARCH_SMOKE_JWT.*GIVEUP|GIVEUP.*A_SEARCH_SMOKE_JWT/);
  });
});

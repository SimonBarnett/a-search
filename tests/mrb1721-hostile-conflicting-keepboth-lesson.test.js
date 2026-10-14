'use strict';

/**
 * MRB #1721 hostile pin: harvest-lesson CONFLICTING keep-both playbook
 * contiguous ASCII in harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'a-search harvest-lesson CONFLICTING on harvest-agent-skills: merge main keep-both (preserve main bullets + tip lesson), light triage FR#3317, --auto --squash, DONE without CI poll';

test('mrb1721: harvest-lesson CONFLICTING keep-both lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'CONFLICTING keep-both harvest lesson must stay contiguous');
  assert.ok(text.includes('keep-both'), 'must cite keep-both');
  assert.ok(text.includes('FR#3317'), 'must cite FR#3317');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

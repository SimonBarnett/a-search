'use strict';

/**
 * MRB #1725 hostile pin: MERGEABLE single-bullet harvest-lesson playbook
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
  'a-search harvest-lesson MERGEABLE single-bullet tip: light triage FR#3317 then --auto --squash; DONE without CI poll; no keep-both needed when tip already based on current main';

test('mrb1725: MERGEABLE single-bullet lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'MERGEABLE single-bullet harvest lesson must stay contiguous');
  assert.ok(text.includes('FR#3317'), 'must cite FR#3317');
  assert.ok(text.includes('--auto --squash'), 'must cite auto squash');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

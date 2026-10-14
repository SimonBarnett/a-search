'use strict';

/**
 * MRB #1742 hostile pin: re-offer CONFLICTING harvest-lesson playbook
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
  'a-search harvest-lesson re-offer CONFLICTING: re-merge main keep-both, reaffirm PASS board, --auto --squash, DONE without CI poll; do not open a second tip';

test('mrb1742: re-offer CONFLICTING lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 're-offer CONFLICTING harvest lesson must stay contiguous');
  assert.ok(text.includes('do not open a second tip'), 'must cite do not open a second tip');
  assert.ok(text.includes('reaffirm PASS board'), 'must cite reaffirm PASS board');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

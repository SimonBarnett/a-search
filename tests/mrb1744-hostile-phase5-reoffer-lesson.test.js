'use strict';

/**
 * MRB #1744 hostile pin: Phase5 product tip re-offer behind main playbook
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
  'Phase5 product tip re-offer behind main: merge main clean, re-run stack acceptance tests, reaffirm PASS + --auto --squash, DONE without CI poll';

test('mrb1744: Phase5 product tip re-offer lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Phase5 re-offer harvest lesson must stay contiguous');
  assert.ok(text.includes('re-run stack acceptance tests'), 'must cite re-run acceptance');
  assert.ok(text.includes('DONE without CI poll'), 'must cite DONE without CI poll');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

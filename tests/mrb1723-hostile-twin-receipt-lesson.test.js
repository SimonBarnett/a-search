'use strict';

/**
 * MRB #1723 hostile pin: harvest-lesson twin/receipt mashup FAIL-supersede
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
  'a-search harvest-lesson twin/receipt: FAIL-supersede later mashup tip that restates an open dedicated lesson tip (#1695 market-hold) plus CAST IRON FR#3317/#3948 process; close unmerged citing the dedicated tip; DONE FAIL';

test('mrb1723: twin/receipt mashup lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'twin/receipt harvest lesson must stay contiguous');
  assert.ok(text.includes('FAIL-supersede'), 'must cite FAIL-supersede');
  assert.ok(text.includes('DONE FAIL'), 'must cite DONE FAIL');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

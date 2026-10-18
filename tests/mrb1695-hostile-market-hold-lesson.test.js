'use strict';

/**
 * MRB #1748 land: Market-hold disable harvest lesson contiguous ASCII
 * in harvest-agent-skills (clean tip; corrupted docs/mrb-1695 closed).
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
  'Market-hold disable PRs must not globally delete provider id string literals from tests (paths/find/source); retarget enabled asserts and floors 2*enabled_count only.';

test('mrb1748: Market-hold disable lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Market-hold harvest lesson must stay contiguous');
  assert.ok(
    text.includes('2*enabled_count'),
    'must cite floors 2*enabled_count retarget',
  );
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});
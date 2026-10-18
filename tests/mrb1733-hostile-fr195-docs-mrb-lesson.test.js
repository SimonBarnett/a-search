'use strict';

/**
 * MRB #1733 hostile pin: FR-195 ComponentsPiece docs MRB harvest lesson
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
  'FR-195 ComponentsPiece docs MRB: pin widgetGuid tree (no uri-slug required), Parts/Click contracts, FR-251 DB ownership with FR-146 Recommended near a_search_sandbox; docs-only tip MERGEABLE on main then --auto --squash; DONE without CI poll';

test('mrb1733: FR-195 docs MRB lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-195 docs MRB harvest lesson must stay contiguous');
  assert.ok(text.includes('widgetGuid tree'), 'must cite widgetGuid tree');
  assert.ok(text.includes('a_search_sandbox'), 'must cite a_search_sandbox');
  assert.ok(text.includes('DONE without CI poll'), 'must cite DONE without CI poll');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

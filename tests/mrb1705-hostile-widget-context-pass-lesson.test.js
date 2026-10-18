'use strict';

/**
 * MRB #1705 hostile pin: ComponentsPiece widget context pass playbook
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
  'ComponentsPiece widget context pass: widgetGuid folder via widgetPath; fold feedback context/removal; SEARCH_QUERY_CAP_FREE=3 FULL=15; stack on FR-204 tip; non-main base MRB hand-close.';

test('mrb1705: widget context pass lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'widget context pass harvest lesson must stay contiguous');
  assert.ok(text.includes('SEARCH_QUERY_CAP_FREE=3'), 'must cite FREE cap');
  assert.ok(text.includes('fold feedback'), 'must cite fold feedback');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

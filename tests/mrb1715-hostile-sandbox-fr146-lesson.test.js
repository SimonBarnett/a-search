'use strict';

/**
 * MRB #1715 hostile pin: a_search_sandbox + FR-146 Recommended harvest lesson
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
  'Docs that name a_search_sandbox must include FR-146 Recommended context (fr119 pin); ComponentsPiece DB ownership lines need Recommended/FR-146 near the sandbox name.';

test('mrb1715: a_search_sandbox FR-146 lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'a_search_sandbox FR-146 harvest lesson must stay contiguous');
  assert.ok(text.includes('fr119 pin'), 'must cite fr119 pin');
  assert.ok(text.includes('Recommended/FR-146'), 'must cite Recommended/FR-146');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

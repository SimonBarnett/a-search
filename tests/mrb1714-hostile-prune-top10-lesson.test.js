'use strict';

/**
 * MRB #1714 hostile pin: ComponentsPiece prune/top10 playbook
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
  'ComponentsPiece prune/top10: host-level top10 only; prune exclude+expiry+broken flags without HTTP; re-apply live cap each pass; stack on FR-206 tip; non-main base MRB hand-close.';

test('mrb1714: prune/top10 lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'prune/top10 harvest lesson must stay contiguous');
  assert.ok(text.includes('host-level top10 only'), 'must cite host-level top10');
  assert.ok(text.includes('without HTTP'), 'must cite without HTTP');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});
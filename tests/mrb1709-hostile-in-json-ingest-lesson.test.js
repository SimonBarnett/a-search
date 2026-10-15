'use strict';

/**
 * MRB #1709 hostile pin: ComponentsPiece in.json ingest playbook
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
  'ComponentsPiece in.json ingest: exclusive rename to in.processing.json then merge+cap+unlink; free live cap 10; stack on FR-205 tip; non-main base MRB hand-close.';

test('mrb1709: in.json ingest lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'in.json ingest harvest lesson must stay contiguous');
  assert.ok(text.includes('in.processing.json'), 'must cite in.processing.json');
  assert.ok(text.includes('free live cap 10'), 'must cite free live cap 10');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});
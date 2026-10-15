'use strict';

/**
 * MRB #1694 hostile pin: ComponentsPiece widget click buildGoUrl playbook
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
  'ComponentsPiece widget click: buildGoUrl host+widgetGuid+part only; open via openUrl/window.open noopener; pin partsHtml never embeds part.url; stack on FR-202 tip; non-main base MRB hand-close.';

test('mrb1694: widget click buildGoUrl lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'widget click harvest lesson must stay contiguous');
  assert.ok(text.includes('buildGoUrl'), 'must cite buildGoUrl');
  assert.ok(text.includes('partsHtml never embeds part.url'), 'must cite partsHtml pin');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

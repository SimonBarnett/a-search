'use strict';

/**
 * MRB #1698 hostile pin: ComponentsPiece agent site pass playbook
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
  'ComponentsPiece agent site pass: CWD hostDir via widgetPath; exclusive-create site.md/top10.json; secret-needle guard; stack on FR-203 tip; non-main base MRB hand-close.';

test('mrb1698: agent site pass lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'agent site pass harvest lesson must stay contiguous');
  assert.ok(text.includes('widgetPath'), 'must cite widgetPath');
  assert.ok(text.includes('secret-needle guard'), 'must cite secret-needle guard');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

'use strict';

/**
 * MRB #1768 hostile pin: nuanced docs/mrb twin-close harvest lesson
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
  'a-search harvest-lesson: do not land absolute never-close-tip-as-twin-of-docs/mrb; when docs/mrb folds SKILL.md the tip may close as twin of that pin (#1748/#1753); only refuse twin-close for tests-only pins that do not carry the lesson text';

test('mrb1768: nuanced docs/mrb twin-close lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'nuanced twin-close harvest lesson must stay contiguous');
  assert.ok(text.includes('tests-only pins'), 'must cite tests-only pins');
  assert.ok(text.includes('folds SKILL.md'), 'must cite folds SKILL.md');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

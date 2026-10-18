'use strict';

/**
 * MRB #1730 hostile pin: Phase5 FR-210 skillbook harvest lesson
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
  'Phase5 FR-210 skillbook: create top-level components-piece/ like entry/maintainer; pin skillbook-layout.test.js triggers (parts/go/widget/agent/widgetGuid/feedback/idle); leave harvest-agent-skills at repo root; Closes on PR; FR seat never merges';

test('mrb1730: Phase5 FR-210 skillbook lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-210 skillbook harvest lesson must stay contiguous');
  assert.ok(text.includes('components-piece/'), 'must cite components-piece/');
  assert.ok(text.includes('skillbook-layout.test.js'), 'must cite layout pin');
  assert.ok(text.includes('FR seat never merges'), 'must cite FR seat never merges');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

'use strict';

/**
 * MRB #1732 hostile pin: FR-212 ComponentsPiece fixtures harvest lesson
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
  'FR-212 ComponentsPiece fixtures: check in tests/fixtures/components-piece/ for in/live.free/live.full/searches/widget/feedback/host/job/events/stats; pin LIVE_PART_CAP_FREE=10, FR-232 GUID regex, clean live URLs, forbidden secret/PII keys, ctr 0 when denom 0; Closes on PR; FR seat never merges';

test('mrb1732: FR-212 fixtures lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-212 fixtures harvest lesson must stay contiguous');
  assert.ok(text.includes('LIVE_PART_CAP_FREE=10'), 'must cite LIVE_PART_CAP_FREE=10');
  assert.ok(text.includes('FR seat never merges'), 'must cite FR seat never merges');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

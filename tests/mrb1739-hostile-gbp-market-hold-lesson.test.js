'use strict';

/**
 * MRB #1739 hostile pin: GBP/UK market-hold MRB harvest lesson
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
  'GBP/UK market-hold MRB: disable via registry enabled false only (keep folders + id/path string literals); retarget floors to 2*enabled_count; skip win32 CDK synth FR#3717; merge main then --auto --squash; DONE without CI poll';

test('mrb1739: GBP/UK market-hold lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'GBP/UK market-hold harvest lesson must stay contiguous');
  assert.ok(text.includes('enabled false'), 'must cite enabled false');
  assert.ok(text.includes('2*enabled_count'), 'must cite 2*enabled_count');
  assert.ok(text.includes('FR#3717'), 'must cite FR#3717');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

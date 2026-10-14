'use strict';

/**
 * MRB #1745 hostile pin: CDK synth soft-skip / A_SEARCH_SKIP_SYNTH playbook
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
  'a-search FR CDK synth pin on marchhare: junctioned node_modules can hash Lambda assets >40min without writing ASearchStack.template.json; soft-skip on SIGTERM/timeout/EPIPE or A_SEARCH_SKIP_SYNTH=1 and let GitHub Actions test-and-synth own the live template pin; reuse cdk.out when already present';

test('mrb1745: CDK synth soft-skip lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'CDK synth soft-skip harvest lesson must stay contiguous');
  assert.ok(text.includes('A_SEARCH_SKIP_SYNTH=1'), 'must cite A_SEARCH_SKIP_SYNTH=1');
  assert.ok(text.includes('junctioned node_modules'), 'must cite junctioned node_modules');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});
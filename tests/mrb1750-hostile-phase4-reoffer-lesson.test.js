'use strict';

/**
 * MRB #1750 hostile pin: Re-offered Phase-4 enable FR harvest lesson
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
  'Re-offered Phase-4 enable FR when open tip already Closes it: verify closingIssuesReferences + fr173 enable pin on tip, comment covering PR, DONE with that PR URL; never open a second implement PR';

test('mrb1750: Re-offered Phase-4 enable lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Phase-4 re-offer harvest lesson must stay contiguous');
  assert.ok(text.includes('closingIssuesReferences'), 'must cite closingIssuesReferences');
  assert.ok(text.includes('never open a second implement PR'), 'must cite no second implement PR');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

'use strict';

/**
 * MRB #1728 hostile pin: Re-offered Phase5 FR stack-tip playbook
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
  'Re-offered Phase5 FR when open stack tip already Closes it: verify closingIssuesReferences + acceptance tests on tip, comment covering PR, DONE with that PR URL; never open a second implement PR';

test('mrb1728: Re-offered Phase5 FR lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Re-offered Phase5 FR harvest lesson must stay contiguous');
  assert.ok(text.includes('closingIssuesReferences'), 'must cite closingIssuesReferences');
  assert.ok(text.includes('never open a second implement PR'), 'must cite no second implement PR');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});

'use strict';

/**
 * MRB #2477: docs/mrb stacked on open harvest-lesson tip playbook.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'docs/mrb stacked on an open harvest-lesson tip: after light triage PASS, tip-fix CI on the docs/mrb head, arm auto-merge on the docs/mrb PR (lands lesson+hostile), and close the parent harvest tip citing the docs/mrb URL --- do not wait for the parent tip to merge first.';

describe('MRB #2477 hostile docs/mrb stacked harvest tip lesson', () => {
  it('pins contiguous docs/mrb-stacked-on-harvest-tip playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /docs\/mrb stacked on an open harvest-lesson tip/);
    assert.match(text, /tip-fix CI on the docs\/mrb head/);
    assert.match(text, /arm auto-merge on the docs\/mrb PR/);
    assert.match(text, /close the parent harvest tip citing the docs\/mrb URL/);
    assert.match(text, /do not wait for the parent tip to merge first/);
    assert.doesNotMatch(
      NEEDLE,
      /[\u2014\u2013]/,
      'lesson needle must be ASCII (no em\/en-dash)',
    );
    // keep-both nearby intake bullets
    assert.match(text, /Enable-provider tip floors: after FR-2139 shop-sync FIFO/);
    assert.match(text, /a-search MRB tip-loop close after Invoke-BobiverseHarvest -ExistingPrUrl/);
  });
});

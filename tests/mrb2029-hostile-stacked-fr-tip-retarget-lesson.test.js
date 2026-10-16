'use strict';

/**
 * MRB #2029 / FR #2423: stacked FR tip retarget + FR #3948-safe merge playbook.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Stacked FR tip on non-default base: retarget to main so Closes links; when required-ci blocks on multi-hour Actions queue with local green unit tests, arm gh pr merge --auto --squash (never --admin; FR #3948) and optionally file CI backlog intake; close parent tip as superseded.';

describe('MRB #2029 / FR #2423 hostile stacked FR tip retarget lesson', () => {
  it('pins contiguous stacked-FR-retarget + auto-squash playbook (FR #3948)', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /retarget to main so Closes links/);
    assert.match(text, /arm gh pr merge --auto --squash/);
    assert.match(text, /never --admin; FR #3948/);
    assert.match(text, /optionally file CI backlog intake/);
    assert.match(text, /close parent tip as superseded/);
    assert.equal(text.includes('document admin-merge + file CI backlog intake'), false, 'must not teach document admin-merge');
    // keep-both recent bullets
    assert.match(text, /a-search docs\/mrb for open product tip/);
    assert.match(text, /quotes product Closes #N-#M/);
    assert.doesNotMatch(
      NEEDLE,
      /[\u2014\u2013]/,
      'lesson needle must be ASCII (no em\/en-dash)',
    );
  });
});

'use strict';

/**
 * MRB #2221 hostile pins for FR-2054 docs/hostile green-before-merge lesson.
 */

const { describe, it } = require('node:test');
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
const GATE = path.join(ROOT, 'tests', 'fr2054-mrb-hostile-green-before-merge.test.js');

describe('MRB #2221 hostile FR-2054 docs/hostile green before merge', () => {
  it('skill forbids merge-while-red; prefer match forbid prose; no conflict markers', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
    assert.match(text, /hostile suite green before gh pr merge/);
    assert.match(text, /prefer assert\.match on forbid prose/);
    assert.match(text, /FR-2054/);
    assert.match(text, /partner_monthly/);
  });

  it('fr2054 gate pins NEEDLE and mrb1869 match-not-doesNotMatch', () => {
    const text = fs.readFileSync(GATE, 'utf8');
    assert.match(text, /const NEEDLE/);
    assert.match(text, /mrb1869-hostile-fr214-merchant-docs/);
    assert.match(text, /assert\.doesNotMatch\(text,\s*\/assert\\.doesNotMatch/);
  });
});

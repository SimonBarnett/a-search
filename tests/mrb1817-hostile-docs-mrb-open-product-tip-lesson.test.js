'use strict';

/**
 * MRB #1817 docs/hostile: docs/mrb open product tip harvest lesson.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'a-search docs/mrb for open product tip: merge origin/main into docs pin and dependency FR tip when both behind; run hostile suite against the product tip tree; --auto --squash both; DONE without CI poll';

describe('MRB #1817 hostile docs/mrb open-product-tip lesson', () => {
  it('pins contiguous docs/mrb open product tip playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /--auto --squash both/);
    assert.match(text, /DONE without CI poll/);
    // keep-both recent bullets
    assert.match(text, /GBP\/UK market-hold MRB/);
    assert.match(text, /quotes product Closes #N-#M/);
  });
});

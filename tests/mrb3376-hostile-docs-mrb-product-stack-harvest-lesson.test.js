'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
// FR #4367 rewrote the old "stack then Closes / close parent product" advice.
const NEEDLE =
  'a-search docs/mrb for a product tip: never stack on an OPEN product head (FR #4367). Merge the product first, then open docs/mrb-N from the new origin/main tip (or a tip that only has docs/tests). Do not put Closes on a stacked docs tip and close the product PR as superseded.';

describe('mrb3376 hostile docs/mrb-on-product-tip harvest-lesson', () => {
  it('SKILL.md contiguous docs/mrb no-stack-on-open-product lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search docs/mrb for a product tip: never stack on an OPEN product head'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(
      text.includes(
        'put Closes on the docs/mrb, arm --auto --squash on docs/mrb, close the parent product tip',
      ),
      false,
      'old close-parent-product advice must stay gone',
    );
  });
});

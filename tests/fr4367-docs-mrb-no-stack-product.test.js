'use strict';

/**
 * FR #4367: docs/mrb must not stack on an open product tip.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bookPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const PRIOR =
  'When a Lambda reserved concurrency is 1, do not set SQS event source MaximumConcurrency. The AWS floor is 2, and Lambda rejects a maximum above the reserve. Reserved concurrency already serialises the worker.';

const LESSON =
  'When a product PR is still OPEN, open docs/mrb-N from origin/main after that product merges (or from a tip that only has docs/tests). Never stack docs/mrb on the open product head. Do not put Closes on a stacked docs tip and close the product PR as superseded.';

const REWRITE =
  'a-search docs/mrb for a product tip: never stack on an OPEN product head (FR #4367). Merge the product first, then open docs/mrb-N from the new origin/main tip (or a tip that only has docs/tests). Do not put Closes on a stacked docs tip and close the product PR as superseded.';

describe('FR #4367 docs/mrb no stack on open product', () => {
  it('keeps the harvested lesson after reserved concurrency and rewrites the old stack advice', () => {
    const buf = fs.readFileSync(bookPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8').replace(/\r\n/g, '\n');
    assert.ok(text.includes(PRIOR + '\n- ' + LESSON), 'contiguous harvest lesson');
    assert.ok(text.includes(REWRITE), 'mid-book rewrite of the stacked-docs advice');
    assert.equal(
      text.includes(
        'put Closes on the docs/mrb, arm --auto --squash on docs/mrb, close the parent product tip',
      ),
      false,
      'old close-parent-product advice must be gone',
    );
  });
});

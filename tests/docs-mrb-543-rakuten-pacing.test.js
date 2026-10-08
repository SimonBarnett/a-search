'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
describe('docs/mrb-543 rakuten maxConcurrency docs', () => {
  it('sqs-pacing mentions rakuten FR-058g with amazon/ebay', () => {
    const t = fs.readFileSync(path.join(root, 'docs/sqs-pacing.md'), 'utf8');
    assert.match(t, /rakuten/);
    assert.match(t, /FR-058g/);
    assert.match(t, /amazon.*ebay.*rakuten|amazon\/ebay\/rakuten/);
  });
  it('add-source rateLimit examples include rakuten', () => {
    const t = fs.readFileSync(path.join(root, 'docs/add-source.md'), 'utf8');
    assert.match(t, /amazon, ebay, rakuten.*have examples/);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search docs/mrb stacked on product tip when tip lacks on-tip hostile: after PASS, put Closes on the docs/mrb, arm --auto --squash on docs/mrb, close the parent product tip citing the docs/mrb URL --- do not leave both armed to race";

describe('mrb3376 hostile docs/mrb-on-product-tip harvest-lesson', () => {
  it('SKILL.md contiguous docs/mrb stacked on product tip lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search docs/mrb stacked on product tip when tip lacks on-tip hostile'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

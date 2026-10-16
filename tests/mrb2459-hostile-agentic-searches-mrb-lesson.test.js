'use strict';

/**
 * docs/mrb-2459: hostile pin Agentic Searches product MRB reuse docs/mrb-2075.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'Product MRB for Agentic Searches: reuse existing docs/mrb-2075 (#2082) hostile pins; verify idle zero-token + classify-null agent outputs + FIFO/DLQ locally; arm auto-merge on product+docs without waiting CI (ambient stay-dark is #2328).';

describe('mrb2459 hostile Agentic Searches product MRB lesson', () => {
  it('SKILL.md contiguous Agentic Searches / docs/mrb-2075 lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('Product MRB for Agentic Searches'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});

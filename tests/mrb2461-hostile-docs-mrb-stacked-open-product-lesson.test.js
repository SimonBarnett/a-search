'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'docs/mrb stacked on open product tip: run hostile+product tests, fix shared CI blockers on both tips, arm auto-merge product tip (Closes) then docs/mrb (Refs) without waiting for CI';

describe('mrb2461 hostile docs/mrb stacked open product tip lesson', () => {
  it('SKILL.md contiguous docs/mrb stacked lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('docs/mrb stacked on open product tip'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

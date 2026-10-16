'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Harvest-lesson tip for an already-merged docs-only product MRB: light triage PASS when the bullet is absent on main, tip-fix CI keep-green (fr106/108 wix stay-dark), fold hostile onto the tip, arm --auto --squash, DONE without waiting for CI.';

describe('mrb2481 hostile already-merged docs-only harvest-lesson', () => {
  it('SKILL.md contiguous already-merged docs-only lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('Harvest-lesson tip for an already-merged docs-only'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

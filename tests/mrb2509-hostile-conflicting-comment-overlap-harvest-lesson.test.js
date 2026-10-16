'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Harvest-lesson tip for CONFLICTING comment-only overlap (keep-both FR citations + restore newlines after marker replace): light triage PASS when absent on main; merge origin/main if behind; hostile already on tip means no second docs/mrb; arm --auto --squash.';

describe('mrb2509 hostile CONFLICTING comment-only overlap harvest-lesson tip', () => {
  it('SKILL.md contiguous CONFLICTING comment-only overlap lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('Harvest-lesson tip for CONFLICTING comment-only overlap'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search harvest-lesson MRB after sibling GIVEUP self-MRB (keep-both author): sibling seat resets tip to origin/main + UTF8 append + on-tip hostile, force-pushes intake branch, arms --auto --squash, DONE without second docs/mrb";

describe('mrb3363 hostile sibling-GIVEUP harvest-lesson tip', () => {
  it('SKILL.md contiguous sibling-GIVEUP self-MRB lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search harvest-lesson MRB after sibling GIVEUP self-MRB'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "CONFLICTING harvest tip fix: branch from current origin/main, add only lesson+hostile, force-push; never git reset --soft origin/main on a dirty tip (deletes unrelated tip/main files from the PR)";

describe('mrb2660 hostile no soft-reset harvest-lesson tip', () => {
  it('SKILL.md contiguous CONFLICTING soft-reset lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('CONFLICTING harvest tip fix: branch from current origin/main'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

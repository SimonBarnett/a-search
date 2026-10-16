'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search CONFLICTING harvest-lesson tip: git reset --hard origin/main then UTF8Encoding(false) append the single lesson bullet; force-push tip; arm --auto --squash; put hostile pin on docs/mrb-N from new main (test-only after squash) --- do not keep-both merge a stale tip that rewrites the book";

describe('mrb3360 hostile CONFLICTING hard-reset harvest-lesson tip', () => {
  it('SKILL.md contiguous hard-reset UTF8 append lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search CONFLICTING harvest-lesson tip: git reset --hard origin/main'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(/[\u00C0-\u00FF]{2,}/.test(line), false, 'no mojibake runs');
  });
});

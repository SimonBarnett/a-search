'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'CI tip that only changes runs-on to self-hosted labels with fork==true -> ubuntu-latest: merge origin/main for ambient stay-dark, pin hostile on job id + fork gate + a-search labels, arm --auto --squash; prior CI fail may already prove the self-hosted path executed.';

describe('mrb2523 hostile CI self-hosted harvest-lesson tip', () => {
  it('SKILL.md contiguous CI self-hosted runs-on lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('CI tip that only changes runs-on to self-hosted labels'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

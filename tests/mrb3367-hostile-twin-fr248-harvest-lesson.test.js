'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search harvest twin tips both add FR-248 ebay tenantParam=customid / fr039 userId= pin lesson: close the later tip citing the first; leave the first tip with on-tip hostile + auto-merge";

describe('mrb3367 hostile twin FR-248 harvest-lesson tip', () => {
  it('SKILL.md contiguous twin FR-248 ebay customid lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search harvest twin tips both add FR-248 ebay tenantParam=customid'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search FR-3355 MRB: after FR-3344 IN/ folder, lock in_ready classify on IN/{searchId}.json via agentEventClassify.isInReadyKey; reject legacy in.json and IN/.processing; leave living #1343 CDK open";

describe('mrb3380 hostile FR-3355 in_ready harvest-lesson tip', () => {
  it('SKILL.md contiguous FR-3355 in_ready IN/ classify lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search FR-3355 MRB: after FR-3344 IN/ folder'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

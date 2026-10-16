'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search FR-3373: keep FR-197 customerNumber tree; put zero-byte folder marker Metadata userid + tags hasdns/partnerid/hasupg; annotations as 1MiB JSON sidecars (_host.annotations.json / widget _annotations.json); inject putObject in tests";

describe('mrb3392 hostile FR-3373 harvest-lesson tip', () => {
  it('SKILL.md contiguous FR-3373 host-folder harvest lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('a-search FR-3373: keep FR-197 customerNumber tree'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});

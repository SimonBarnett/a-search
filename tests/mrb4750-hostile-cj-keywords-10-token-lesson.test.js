'use strict';

/** Hostile pin for harvest tip #4750: CJ keywords cap at 10 whitespace tokens. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4750 CJ keywords 10-token cap lesson', () => {
  it('harvest-agent-skills pins CJ Too many keywords / 10-token cap', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const raw = fs.readFileSync(p);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    assert.match(src, /CJ Product Search: after \[String!\]! keywords/);
    assert.match(src, /cap whitespace tokens at 10/);
    assert.match(src, /Too many keywords/);
    assert.match(src, /keep short phrases as one element/);
    const line = src.split(/\r?\n/).find((l) => l.includes('cap whitespace tokens at 10'));
    assert.ok(line, 'lesson line present');
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });

  it('this pin file ends with a trailing newline', () => {
    const self = fs.readFileSync(__filename);
    assert.ok(self.length > 0 && self[self.length - 1] === 0x0a);
  });
});

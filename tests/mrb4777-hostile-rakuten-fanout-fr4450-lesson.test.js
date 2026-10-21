'use strict';

/**
 * Hostile pin for MRB #4777: after FR #4768 per-query Rakuten fan-out,
 * fr4450-style pins must assert keywords across all productsearch GETs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('docs/mrb-4777 Rakuten fan-out fr4450 harvest lesson', () => {
  it('pins FR #4768 fan-out test update for fr4450', () => {
    const raw = fs.readFileSync(SKILL);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    const line = src
      .split(/\r?\n/)
      .find((l) => l.includes('fr4450') && l.includes('FR #4768'));
    assert.ok(line, 'fr4450 / FR #4768 lesson present');
    assert.match(line, /fans out Rakuten Product Search per query/);
    assert.match(line, /across all productsearch GETs/);
    assert.match(line, /token \+ N product calls/);
    assert.match(line, /not \/model\/i on each single call/);
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });

  it('this pin file ends with a trailing newline', () => {
    const self = fs.readFileSync(__filename);
    assert.ok(self.length > 0 && self[self.length - 1] === 0x0a);
  });
});

'use strict';

/**
 * Hostile pin for MRB #4764: CJ GraphQL non-JSON 403 Authorised harvest tip.
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

describe('docs/mrb-4764 CJ cj_not_authorised harvest lesson', () => {
  it('pins non-JSON 403 Authorised -> status IN, no DLQ/intake', () => {
    const raw = fs.readFileSync(SKILL);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    const line = src
      .split(/\r?\n/)
      .find((l) => l.includes('cj_not_authorised') && l.includes('Authorised'));
    assert.ok(line, 'cj_not_authorised lesson present');
    assert.match(line, /non-JSON 403/);
    assert.match(line, /status IN empty products/);
    assert.match(line, /complete SQS/);
    assert.match(line, /do not intake-fatal or DLQ-burn/);
    assert.match(line, /creators_not_eligible/);
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });

  it('this pin file ends with a trailing newline', () => {
    const self = fs.readFileSync(__filename);
    assert.ok(self.length > 0 && self[self.length - 1] === 0x0a);
  });
});

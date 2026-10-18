'use strict';

/**
 * docs/mrb-4228 hostile pin: FIX docs/mrb a-affiliates rewrite lesson contiguous
 * ASCII in harvest-agent-skills (fr4123 / #4208 Download format / keep-both).
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

const NEEDLE =
  'FIX docs/mrb when FR #4195 rewrites docs/a-affiliates.md: restore contiguous awin-agent|FR #4123 section (fr4123 pin) and keep #4208 Download format; one main fold keep-both product tip over weekly alias.';

describe('MRB #4228 hostile docs/mrb a-affiliates pin harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous FR #4195 / fr4123 / #4208 lesson');
    assert.ok(text.includes('awin-agent|FR #4123'), 'awin-agent|FR #4123');
    assert.ok(text.includes('#4208 Download format'), '#4208 Download format');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});

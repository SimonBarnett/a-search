'use strict';

/**
 * MRB #4993 / FR #4197: hostile pin that harvest-agent-skills GUID marker
 * lesson stays pure ASCII (IN->live ---) so whole-file fr4197 / mrb1172 gates
 * stay green on main.
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

const GUID_NEEDLE =
  'GUID marker ready-flag is enabled (not init); /parts must not promote IN->live --- search sets hasresults only; agent/monitor promoteInToLive builds live.json (FR #5270); searching is HTTP 202 + Retry-After.';

describe('MRB #4993 hostile FR #4197 harvest-agent-skills ASCII', () => {
  it('SKILL.md is UTF-8 no-BOM and pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(
        buf[i] < 128,
        'non-ASCII byte at ' + i + ' (0x' + buf[i].toString(16) + ')',
      );
    }
  });

  it('GUID marker lesson uses ASCII IN->live --- (no Unicode arrow/em-dash)', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(GUID_NEEDLE), 'contiguous GUID marker ASCII needle');
    assert.equal(text.includes('\u2192'), false, 'no Unicode right-arrow');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
    assert.equal(text.includes('\u2013'), false, 'no en-dash');
    assert.equal(text.includes('IN\u2192live'), false, 'no IN+arrow+live');
  });
});

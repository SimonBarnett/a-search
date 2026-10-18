'use strict';

/**
 * docs/mrb-4355 hostile pin: update synth pins when placeholder secrets are skipped.
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

const PRIOR =
  'A FIX or docs PR that contains a commit this seat pushed is self-MRB even when the git author email is a sibling seat nick. ACK then GIVEUP. Do not review the LF pin.';

const NEEDLE =
  'When provider secret wiring is skipped unless the context ARN is real, update every synth pin that still requires the placeholder credential env. Plain defaults and queues stay.';

describe('MRB #4355 hostile placeholder secret pins', () => {
  it('pins the synth-pin lesson after the self-MRB bullet', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    assert.equal(buf[buf.length - 1], 0x0a, 'trailing newline');
    const text = buf.toString('utf8').replace(/\r\n/g, '\n');
    const priorAt = text.indexOf(PRIOR);
    const needleAt = text.indexOf(NEEDLE);
    assert.ok(priorAt >= 0, 'self-MRB bullet still present');
    assert.ok(needleAt > priorAt, 'placeholder-pin lesson follows it');
    assert.ok(text.includes(PRIOR + '\n- ' + NEEDLE), 'contiguous bullets');
  });
});

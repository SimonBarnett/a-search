'use strict';

/**
 * docs/mrb-5248: pin harvest-agent-skills lesson — AssociateNotEligible IN
 * products>0 stays needs_human; child FR for ack/no-DLQ; do not close living parent.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

function skillText() {
  return fs.readFileSync(skillPath, 'utf8').replace(/^\uFEFF/, '');
}

describe('docs/mrb-5248 AssociateNotEligible living parent', () => {
  it('pins IN products>0 needs_human + child FR + no living-parent close', () => {
    const t = skillText();
    assert.match(t, /IN products>0 is needs_human/);
    assert.match(t, /Associates 10-order gate/);
    assert.match(t, /Implementable ack\/no-DLQ work is a child FR/);
    assert.match(t, /do not close the living parent/);
    assert.match(t, /invent a live IN rerun/);
    // contiguous window: products>0 ... living parent
    assert.match(
      t,
      /IN products>0 is needs_human[\s\S]{0,200}do not close the living parent/,
    );
  });
});
'use strict';

/**
 * docs/mrb-5196 hostile: docs/skills-only CI must run check_conflict_markers (FR-2611).
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
  'a-search docs/skills-only CI skips npm test (FR-2611): put check_conflict_markers.py under scripts/ and always run it in test-and-synth after checkout so harvest SKILL markers cannot merge.';

describe('MRB #5196 hostile conflict-markers CI harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous conflict-markers CI lesson');
    assert.ok(text.includes('check_conflict_markers.py'), 'check_conflict_markers.py');
    assert.ok(text.includes('test-and-synth'), 'test-and-synth');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});

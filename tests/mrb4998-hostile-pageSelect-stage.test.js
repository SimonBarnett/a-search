'use strict';

/**
 * MRB #4998: hostile pin --- stage-provider-worker-lambda-asset soft-copies
 * shared/widgets/pageSelect.js (FR #5022); never hard-require redqueen pageSelect in fixtures.
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
  'stage-provider-worker-lambda-asset: pageSelect lives in shared/widgets (FR #5022); shared/** stage covers promoteInToLive; never hard-require redqueen pageSelect in minimal test fixtures';

describe('MRB #4998 hostile pageSelect soft-stage lesson', () => {
  it('SKILL.md UTF-8 no-BOM pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
  });

  it('pins contiguous soft-stage pageSelect lesson', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous soft-stage needle');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
    assert.equal(text.includes('\u2192'), false, 'no Unicode arrow');
  });
});

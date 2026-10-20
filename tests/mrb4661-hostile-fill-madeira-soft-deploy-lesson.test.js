'use strict';

/** docs/mrb-4661: pin fill-madeira skip-disabled / soft-deploy harvest lesson. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4661 fill-madeira soft-deploy pin', () => {
  it('harvest-agent-skills pins skip disabled registry + soft-deploy missing .env', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const src = fs.readFileSync(p, 'utf8');
    // Fuller tip: must-skip + registry-enabled SSM + soft-deploy (PR #4670).
    assert.match(src, /fill-madeira must skip disabled registry sources/);
    assert.match(src, /only require \/madeira SSM for registry-enabled providers/);
    assert.match(src, /soft-deploys/);
    assert.match(src, /keep Lambda\/queue\/DLQ/);
  });
});

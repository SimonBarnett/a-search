'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('MRB #4920 harvest pin hourly age FR', () => {
  it('harvest-agent-skills keeps hourly GIVEUP age/fan-out bullet contiguous', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '.grok',
        'skills',
        'harvest-agent-skills',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(
      src,
      /a-searches hourly FR: ACK then GIVEUP needs_human until Simon stamps age key\/unit and how \/search forces a new fan-out; do not invent refresh:true or defaultage\./,
    );
  });
});

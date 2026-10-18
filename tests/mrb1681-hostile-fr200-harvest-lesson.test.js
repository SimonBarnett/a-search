'use strict';

/**
 * MRB #1681 docs/hostile: FR-200 DNS TXT harvest lesson keep-both pin.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB #1681 hostile FR-200 harvest lesson', () => {
  it('pins contiguous FR-200 resolveTxt / Club TXT / Partner never unlocks', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /FR-200 \/go unapproved path: inject resolveTxt into shared\/dns\/hostTxtStatus/,
    );
    assert.match(text, /Club TXT a-search-club=/);
    assert.match(text, /Partner alone never unlocks/);
    assert.match(text, /\/ext\/status shares the same cache/);
    // keep-both: prior bullets must remain after FR-200 land
    assert.match(text, /never-close-tip-as-twin-of-docs\/mrb/);
    assert.match(text, /ComponentsPiece widget context pass/);
  });
});

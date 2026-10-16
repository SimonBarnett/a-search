'use strict';

/**
 * docs/mrb-2329: hostile pin FR-179 -> flip FR-106/108 stay-dark lesson.
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
  'After FR-179 enabled wix, flip FR-106/FR-108 stay-dark asserts (or CI stays red on main and blocks unrelated auto-merges)';

describe('mrb2329 hostile FR-179 flip FR-106/108 stay-dark lesson', () => {
  it('harvest-agent-skills carries contiguous FR-179/106/108 lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('After FR-179 enabled wix'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});

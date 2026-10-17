'use strict';

/**
 * docs/mrb-2179: hostile pin for merchant-adapter CONFLICTING harvest lesson.
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

const LESSON =
  'MRB merchant-adapter CONFLICTING vs sibling (Squarespace/Magento): merge origin/main keep-both adapters/index.js + providers/registry.json entries before squash; pin both stay-dark rows on docs/mrb-N';

describe('docs/mrb-2179 hostile merchant-adapter CONFLICTING lesson', () => {
  it('SKILL.md pins keep-both adapters/index + registry stay-dark contiguous', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, new RegExp(LESSON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const line = text.split(/\r?\n/).find((l) => l.includes('MRB merchant-adapter CONFLICTING vs sibling'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'new lesson has no em-dash');
    assert.equal(line.includes('\u2013'), false, 'new lesson has no en-dash');
  });
});

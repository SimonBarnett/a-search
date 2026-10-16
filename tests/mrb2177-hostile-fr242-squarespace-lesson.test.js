'use strict';

/**
 * docs/mrb-2177: hostile pin for harvest lesson on FR-242 Squarespace ACCEPTABLE drift.
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
  'MRB Squarespace FR-242: short-lived accessToken in vault for first sync is ACCEPTABLE drift vs refresh-only wording; pin API JSON never leaks tokens; EventBridge keep-alive stays out of scope';

describe('docs/mrb-2177 hostile FR-242 Squarespace harvest lesson', () => {
  it('SKILL.md pins short-lived accessToken ACCEPTABLE drift contiguous', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, new RegExp(LESSON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const line = text.split(/\r?\n/).find((l) => l.includes('MRB Squarespace FR-242: short-lived accessToken'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'new lesson has no em-dash');
    assert.equal(line.includes('\u2013'), false, 'new lesson has no en-dash');
  });
});

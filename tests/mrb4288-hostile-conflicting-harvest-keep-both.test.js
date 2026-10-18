'use strict';

/**
 * MRB #4288 hostile: CONFLICTING harvest tip keeps both bullets.
 * PR #4288 replaced the 120s page-review lesson; this pin requires both.
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

const KEEP_BOTH =
  'On a CONFLICTING harvest tip, fold origin/main once and keep both the tip bullet and the new main bullets, then re-arm auto-merge.';

const PAGE_120S =
  'When a grok page review hits the 120s limit after a larger prompt, tell the model to answer in one shot from the supplied text and not to browse. Keep the timeout, and a GUID retry must not delete the host SQS message.';

describe('MRB #4288 hostile CONFLICTING harvest keep-both', () => {
  it('keeps the 120s page-review lesson and the keep-both fold lesson', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    assert.equal(buf[buf.length - 1], 0x0a, 'trailing newline');
    const text = buf.toString('utf8');
    assert.ok(text.includes(PAGE_120S), '120s page-review lesson kept');
    assert.ok(text.includes(KEEP_BOTH), 'keep-both fold lesson');
    const pageAt = text.indexOf(PAGE_120S);
    const keepAt = text.indexOf(KEEP_BOTH);
    assert.ok(pageAt >= 0 && keepAt > pageAt, 'keep-both is added after the 120s lesson');
  });
});

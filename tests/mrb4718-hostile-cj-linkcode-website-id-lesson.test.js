'use strict';

/** docs/mrb-4718: pin CJ GraphQL linkCode CJ_WEBSITE_ID harvest lesson (PR #4718). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4718 CJ linkCode CJ_WEBSITE_ID lesson', () => {
  it('harvest-agent-skills pins CJ_WEBSITE_ID on GraphQL linkCode', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const raw = fs.readFileSync(p);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    assert.match(src, /GraphQL linkCode\(pid: ID!\) must use CJ_WEBSITE_ID/);
    assert.match(src, /assertCjCreds fails closed without it/);
    assert.match(src, /never omit pid on linkCode/);
    const line = src.split(/\r?\n/).find((l) => l.includes('CJ_WEBSITE_ID') && l.includes('linkCode'));
    assert.ok(line, 'lesson line present');
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII in lesson: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });
});

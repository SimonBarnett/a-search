'use strict';

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

describe('docs/mrb-4836 harvest EventBridge suffix slash', () => {
  it('pins host/GUID-only filter Lambda before a-clubs-changes', () => {
    const t = fs.readFileSync(SKILL, 'utf8');
    assert.match(t, /EventBridge suffix slash over-matches/);
    assert.match(t, /hostkey\/uuid\//);
    assert.match(t, /a-clubs-changes/);
    assert.doesNotMatch(t, /suffix slash targets SQS directly/);
  });
});

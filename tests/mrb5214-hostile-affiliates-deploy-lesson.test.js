'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('MRB #5214 hostile: a-affiliates deploy harvest lesson', () => {
  it('pins MANIFEST-managed deploy WhatIf IncludeSkills and no --delete/_invites', () => {
    const t = fs.readFileSync(SKILL, 'utf8');
    assert.ok(!t.startsWith('\ufeff'));
    assert.match(t, /a-affiliates code deploy: MANIFEST-managed keys only/);
    assert.match(t, /default WhatIf/);
    assert.match(t, /skip SKILLS\.md unless -IncludeSkills/);
    assert.match(t, /never --delete or touch _invites\/merchant folders/);
  });
});
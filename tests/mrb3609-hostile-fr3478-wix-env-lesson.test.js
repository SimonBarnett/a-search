'use strict';

/**
 * Hostile pin: MRB a-search#3609 / FR #3611 — FR #3478 wix env lesson on harvest-agent-skills.
 * Uses CRLF-safe includes (not assert.match with literal \\n).
 */
const { describe, it } = require('node:test');
const path = require('node:path');
const { assertSkillIncludes } = require('./helpers/skillText');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('mrb3609 hostile: FR #3478 wix env lesson (CRLF-safe)', () => {
  it('SKILL.md includes FR #3478 live-target a_search bullet', () => {
    assertSkillIncludes(
      skillPath,
      'a-search FR #3478: wix providers/local/wix/.env.example live-target comment must name a_search (FR-251), not the read-only catalogue database',
    );
  });
});

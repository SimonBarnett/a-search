/**
 * Hostile pin: MRB a-search#1110 harvest-lesson — sibling EventBridge absence-pin playbook
 * must remain contiguous in harvest-agent-skills after merge.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb1110 hostile: EventBridge sibling absence-pin lesson', () => {
  it('skill book keeps contiguous EventBridge sibling + absence assert playbook', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(
      text,
      /When adding a sibling EventBridge rule that older FR pins explicitly forbade[\s\S]{0,220}?flip those absence asserts to presence/
    );
    assert.match(text, /ImpactOnboardingLiveSchedule/);
    assert.match(text, /docs\/mrb-N/);
  });
});

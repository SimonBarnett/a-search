'use strict';

/**
 * MRB #1434 hostile pin: Phase-4 enable retargets mrb668 stub count
 * + floors 2*enabled_count; contiguous NEEDLE on harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Phase-4 enable FR: after enabling an id, retarget mrb668 Phase-2 stub count (and fr166 PHASE2_STUB_IDS) down by 1 and FR-142/143 floors to 2*enabled_count before CI; concurrent open enable tips stay dark until merged';

test('mrb1434: Phase-4 mrb668 stub-count tip contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'mrb668 Phase-4 enable tip must stay contiguous');
  assert.ok(text.includes('retarget mrb668 Phase-2 stub count'));
  assert.ok(text.includes('fr166 PHASE2_STUB_IDS'));
  assert.ok(text.includes('2*enabled_count'));
  assert.ok(text.includes('concurrent open enable tips stay dark until merged'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});

test('mrb1434: harvest-agent-skills keeps frontmatter and Harvested lessons floor', () => {
  const text = fs.readFileSync(SKILL, 'utf8');
  assert.ok(text.startsWith('---\n') || text.startsWith('---\r\n'), 'YAML frontmatter start');
  assert.ok(text.includes('name: harvest-agent-skills'), 'skill name frontmatter');
  assert.ok(text.includes('## Harvested lessons (intake)'), 'Harvested lessons section');
  const lines = text.split(/\r?\n/);
  assert.ok(lines.length >= 100, 'SKILL.md must not be wiped to a stub (floor 100 lines)');
  const intakeBullets = lines.filter((l) => l.startsWith('- '));
  assert.ok(intakeBullets.length >= 20, 'enough lesson bullets remain');
});

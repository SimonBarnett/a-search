'use strict';

/**
 * MRB #1339 hostile pin: harvest-lesson tips append/fold one bullet;
 * never rewrite/wipe harvest-agent-skills; neutralize GitHub close keywords.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Harvest-lesson tips must append/fold one bullet on current main SKILL.md never rewrite/wipe the book; neutralize GitHub close keywords in session summaries so tips do not Closes product issues (MRB #1332 / #1338).';

test('mrb1339: append/fold harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'append/fold harvest lesson must stay contiguous');
  assert.ok(text.includes('append/fold one bullet'));
  assert.ok(text.includes('never rewrite/wipe'));
  assert.ok(text.includes('neutralize GitHub close keywords'));
  assert.ok(text.includes('MRB #1332'));
  assert.ok(text.includes('#1338'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});

test('mrb1339: harvest-agent-skills keeps frontmatter and Harvested lessons floor', () => {
  const text = fs.readFileSync(SKILL, 'utf8');
  assert.ok(text.startsWith('---\n') || text.startsWith('---\r\n'), 'YAML frontmatter start');
  assert.ok(text.includes('name: harvest-agent-skills'), 'skill name frontmatter');
  assert.ok(text.includes('## Harvested lessons (intake)'), 'Harvested lessons section');
  const lines = text.split(/\r?\n/);
  assert.ok(lines.length >= 100, 'SKILL.md must not be wiped to a stub (floor 100 lines)');
  const intakeBullets = lines.filter((l) => l.startsWith('- '));
  assert.ok(intakeBullets.length >= 20, 'enough lesson bullets remain');
});

'use strict';

/**
 * MRB #1379 hostile pin: CONFLICTING harvest-lesson tips keep-both,
 * exact twin close by full lesson title, docs/mrb contiguous NEEDLE.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'a-search CONFLICTING harvest-lesson tips on harvest-agent-skills: merge origin/main keep-both, close exact twin tips by full lesson title, then docs/mrb contiguous NEEDLE pin';

test('mrb1379: CONFLICTING harvest-lesson tip contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'CONFLICTING harvest-lesson tip must stay contiguous');
  assert.ok(text.includes('merge origin/main keep-both'));
  assert.ok(text.includes('close exact twin tips by full lesson title'));
  assert.ok(text.includes('docs/mrb contiguous NEEDLE pin'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});

test('mrb1379: harvest-agent-skills keeps frontmatter and Harvested lessons floor', () => {
  const text = fs.readFileSync(SKILL, 'utf8');
  assert.ok(text.startsWith('---\n') || text.startsWith('---\r\n'), 'YAML frontmatter start');
  assert.ok(text.includes('name: harvest-agent-skills'), 'skill name frontmatter');
  assert.ok(text.includes('## Harvested lessons (intake)'), 'Harvested lessons section');
  const lines = text.split(/\r?\n/);
  assert.ok(lines.length >= 100, 'SKILL.md must not be wiped to a stub (floor 100 lines)');
  const intakeBullets = lines.filter((l) => l.startsWith('- '));
  assert.ok(intakeBullets.length >= 20, 'enough lesson bullets remain');
});

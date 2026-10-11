'use strict';

/**
 * MRB #1382 hostile pin: product MRB far-behind fold / docs/mrb / planned-wave FR lesson
 * contiguous in harvest-agent-skills (tip #1382).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'a-search product MRB: when tip is far behind main, merge origin/main into the FR branch and re-wait CI before gh pr merge; put additive hostile pins (registry stay-dark stubs + index needles) on one docs/mrb-N PR from the new main tip after product merge; file a follow-up FR for planned-wave table rows that Simon already closed not-planned (do not FAIL the index-only FR for adjacent wave annotations).';

test('mrb1382: product MRB fold/CI/docs/mrb harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'product MRB fold harvest lesson must stay contiguous');
  assert.ok(text.includes('far behind main'));
  assert.ok(text.includes('docs/mrb-N'));
  assert.ok(text.includes('planned-wave'));
  assert.ok(text.includes('index-only FR'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});

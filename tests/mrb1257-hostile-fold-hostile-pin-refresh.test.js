'use strict';

/**
 * MRB #1257 hostile pin: harvest tip fold/expand must refresh hostile pins;
 * keep-both CloudWatch Yes + CI Yes when FR-143 meets FR-139.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'When a harvest tip folds/expands an existing contiguous lesson bullet, refresh every hostile pin that asserts the old string in the same MRB tip; keep-both release-gap CloudWatch Yes + CI Yes when FR-143 meets FR-139 on main';

test('mrb1257: fold/hostile-pin refresh lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.ok(raw[0] !== 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'fold/hostile-pin lesson must stay contiguous');
  assert.ok(text.includes('refresh every hostile pin'));
  assert.ok(text.includes('CloudWatch Yes'));
  assert.ok(text.includes('FR-143'));
  assert.ok(text.includes('FR-139'));
  // Keep-both: FR-143 product bullet still present after merge conflict resolve.
  assert.ok(
    text.includes('FR-143: prefer lambda logGroup') ||
      text.includes('ONE_MONTH'),
  );
  const line = text.split(/\r?\n/).find((l) => l.includes('folds/expands'));
  assert.ok(line, 'folds/expands lesson line present');
  for (let i = 0; i < line.length; i++) {
    assert.ok(line.charCodeAt(i) < 128, `non-ascii in lesson line at ${i}`);
  }
});

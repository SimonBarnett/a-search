'use strict';

/**
 * MRB #4102 hostile pin: Redqueen a-clubs drain harvest lesson contiguous in harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Redqueen a-clubs drain: PutObjectAnnotation on folder markers (never annotations.json); GUID markers are trailing-slash keys; stub reviewer must never set annotated=1; install via sc.exe service under a-search-redqueen-annotator profile';

test('mrb4102: Redqueen a-clubs harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Redqueen a-clubs drain harvest lesson must stay contiguous');
  assert.ok(text.includes('PutObjectAnnotation'));
  assert.ok(text.includes('never annotations.json'));
  assert.ok(text.includes('trailing-slash keys'));
  assert.ok(text.includes('annotated=1'));
  assert.ok(text.includes('a-search-redqueen-annotator'));
});

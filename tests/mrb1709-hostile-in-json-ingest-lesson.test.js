'use strict';

/**
 * MRB #1709 / FR-3344 hostile pin: ComponentsPiece IN/ folder ingest playbook
 */
const { test } = require('node:test');
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

const NEEDLE =
  'ComponentsPiece IN/ folder ingest (FR-3344): writers use writeInSearchFile one JSON per searchId; agent moves IN/*.json to IN/.processing then merge+cap+unlink; free live cap 10; never merge searches into a single in.json.';

test('mrb1709: IN/ folder ingest lesson contiguous ASCII in harvest-agent-skills', () => {
  const buf = fs.readFileSync(SKILL);
  assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
  const text = buf.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'IN/ folder ingest harvest lesson must stay contiguous');
  assert.ok(text.includes('IN/.processing'), 'must cite IN/.processing');
  assert.ok(text.includes('writeInSearchFile'), 'must cite writeInSearchFile');
});

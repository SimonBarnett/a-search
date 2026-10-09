/**
 * MRB #1153 hostile pin: FR-139 CI harvest lesson contiguous in harvest-agent-skills.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

test('mrb1153: FR-139 ci.yml lesson contiguous in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.equal(raw[0], 0x2d, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  const needle =
    'a-search FR-139: ci.yml on push/PR main with setup-node 20, npm ci, npm test, npm run synth; pin fr139 needles; release-gap CI Yes';
  assert.ok(text.includes(needle), 'FR-139 harvest lesson must stay contiguous');
});

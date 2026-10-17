/**
 * Hostile pin: MRB a-search#3576 harvest-lesson — re-offer tips wrapping still-open first tip.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb3576 hostile: re-offer wrap FAIL-supersede lesson', () => {
  it('SKILL.md contiguous re-offer wrap + Prefer ExistingPrUrl lesson (ASCII no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /Re-offer tips wrapping still-open first tip:\s*FAIL-supersede citing first tip \+ Prefer ExistingPrUrl/
    );
  });
});
/**
 * Hostile pin: MRB a-search#3582 harvest-lesson — re-offer when seat did not author tip.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb3582 hostile: harvest-lesson re-offer without self-MRB', () => {
  it('SKILL.md contiguous re-offer 0-behind DONE PASS lesson (ASCII no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /Harvest-lesson re-offer: if this seat did not author tip commits and tip is 0 behind, re-verify hostile and DONE PASS/
    );
    assert.match(text, /tip-fix keep-both mojibake with checkout main \+ UTF8 append only when skill churn is dirty/);
  });
});
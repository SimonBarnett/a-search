'use strict';

/**
 * FR-2054: MRB docs/hostile green before merge; match forbid prose not doesNotMatch.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const mrb1869 = path.join(root, 'tests', 'mrb1869-hostile-fr214-merchant-docs.test.js');

const NEEDLE =
  'a-search MRB docs/hostile: always run docs/mrb-N hostile suite green before gh pr merge; never merge a docs tip that fails its own pin; prefer assert.match on forbid prose (e.g. never-use partner_monthly) over assert.doesNotMatch for banned tokens that must remain documented (FR-2054 / context mrb-1869 #2052 red then #2053 fix)';

describe('FR-2054 MRB docs/hostile green before merge', () => {
  it('harvest-agent-skills SKILL.md has contiguous lesson (UTF-8 no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'FR-2054 lesson must stay contiguous');
    assert.ok(text.includes('hostile suite green before gh pr merge'));
    assert.ok(text.includes('prefer assert.match on forbid prose'));
    assert.ok(text.includes('assert.doesNotMatch'));
  });

  it('mrb1869 pin matches forbid prose for partner_monthly (not doesNotMatch)', () => {
    assert.ok(fs.existsSync(mrb1869), 'mrb1869 hostile pin missing');
    const text = fs.readFileSync(mrb1869, 'utf8');
    assert.match(text, /assert\.match\([\s\S]*partner_monthly/i);
    assert.doesNotMatch(text, /assert\.doesNotMatch\([\s\S]{0,80}partner_monthly/);
    assert.match(text, /never use|never-use|Partners never/i);
  });
});

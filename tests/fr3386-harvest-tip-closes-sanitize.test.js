'use strict';

/**
 * FR-3386: harvest tip bodies must not embed literal Closes #N / Closes #N/#M.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "a-search harvest tip / tip-loop PR bodies: never leave literal Closes #N or Closes #N/#M in session summaries (GitHub closingIssuesReferences); rewrite to prose without Closes keywords; before arming --auto --squash on harvest-lesson tips verify gh pr view --json closingIssuesReferences is empty (class of #3386 / #3376); Protect-HarvestBodyClosesKeywords in Invoke-BobiverseHarvest must run on the composed scripts path";
const PRIOR =
  'a-search harvest-lesson PR body that quotes product Closes #N-#M in session summary can link closingIssuesReferences';

describe('FR-3386 harvest tip Closes sanitize playbook', () => {
  it('SKILL.md contiguous FR-3386 slash-form + empty closingIssuesReferences gate (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(PRIOR), 'prior closes-poisoning lesson must remain');
    assert.ok(text.includes(NEEDLE), 'missing FR-3386 lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('never leave literal Closes #N or Closes #N/#M'));
    assert.ok(line);
    assert.ok(line.includes('closingIssuesReferences is empty'));
    assert.ok(line.includes('Protect-HarvestBodyClosesKeywords'));
    assert.equal(line.includes('\u2014'), false);
  });
});

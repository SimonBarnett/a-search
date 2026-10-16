'use strict';
/**
 * FR #3431: an MRB fold/tip-fix on an open product tip must keep the tip
 * author's name and email. Committing as the reviewing seat makes a later
 * assign of that tip self-MRB (FR #2604).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skill = fs.readFileSync(
  path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
  'utf8'
);

describe('FR #3431 fold commit keeps the tip author', () => {
  it('pins tip-author fold and forbids the reviewing seat nick', () => {
    assert.match(
      skill,
      /Fold or tip-fix commit on an open product tip: keep the existing tip author name and email/
    );
    assert.match(skill, /git -c user\.name/);
    assert.match(skill, /git -c user\.email/);
    assert.match(skill, /Never commit as the reviewing seat nick/);
    assert.match(skill, /self-MRB \(FR #2604\)/);
    assert.match(skill, /Do not change git config/);
  });
});

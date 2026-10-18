'use strict';

/**
 * FR #3827 / bobiverse#4649: a-search harvest-agent-skills must not tell seats
 * to fold origin/main merely because a tip is behind.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'never fold just because the PR is behind (FR #3827 / bobiverse#4649)';

describe('FR #3827 fold only when CONFLICTING or CI failed on main fix', () => {
  it('pins contiguous never-fold-merely-behind playbook (ASCII no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous FR #3827 fold gate bullet missing');
    assert.match(text, /CONFLICTING\s*\/\s*DIRTY|CONFLICTING\/DIRTY/);
    assert.match(text, /CI failed on (something |a )?(main-fixed|already fixed on main)/i);
    assert.match(text, /#3827/);
    assert.match(text, /bobiverse#4649|#4649/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });

  it('FR-1345/2230/3373 rematch lines no longer prescribe unconditional origin/main fold', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    const lines = text.split(/\r?\n/);
    const bad = [];
    for (const line of lines) {
      if (!/FR-1345|FR-2230|FR-3373/.test(line)) continue;
      if (!/rematch/i.test(line)) continue;
      if (/one origin\/main fold then re-run|one behind-main fold then/.test(line)) {
        bad.push(line.trim().slice(0, 160));
      }
    }
    assert.equal(
      bad.length,
      0,
      `unconditional behind-main fold rematch lines remain:\n${bad.join('\n')}`,
    );
  });

  it('no generic rematch line says fold when tip is merely far behind', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.doesNotMatch(
      text,
      /when tip is far behind main, merge origin\/main into the FR branch and re-wait CI/i,
    );
    assert.doesNotMatch(
      text,
      /one update-branch when tip is far behind/i,
    );
    assert.doesNotMatch(
      text,
      /docs-only FR lock that is far behind main with no file conflicts: one origin\/main fold/i,
    );
  });
});
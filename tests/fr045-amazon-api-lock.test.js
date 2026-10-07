'use strict';

/** FR-045: Phase-1 Amazon API choice LOCKED to PA-API SearchItems */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const LOCKED_PHRASE =
  'LOCKED (Phase 1): Amazon live search uses PA-API SearchItems';

describe('FR-045 Amazon API Phase-1 lock', () => {
  it('provider-shortlist.md has explicit LOCKED PA-API Phase-1 sentence', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'provider-shortlist.md'),
      'utf8',
    );
    assert.match(text, /LOCKED \(Phase 1\): Amazon live search uses PA-API SearchItems/);
    assert.match(text, /Creators API/);
    assert.match(text, /follow-up FR/i);
    // Fail-when: prefer Creators only, with no Phase-1 lock
    assert.ok(
      text.includes(LOCKED_PHRASE),
      'shortlist must name PA-API as Phase-1 LOCKED (not prefer-Creators alone)',
    );
  });

  it('amazon skillbook repeats the same LOCKED Phase-1 sentence', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'live',
        'amazon',
        '.grok',
        'skills',
        'a-search-amazon',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.ok(skill.includes(LOCKED_PHRASE));
    assert.match(skill, /Creators API/);
    assert.match(skill, /follow-up FR/i);
  });
});

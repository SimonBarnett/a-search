'use strict';

/** Hostile pins for FR-046a / MRB #367 — skillbook-layout harvest checklist */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const doc = path.join(__dirname, '..', 'docs', 'skillbook-layout.md');

describe('hostile MRB #367 FR-046a skillbook-layout harvest', () => {
  it('example blurb pins Report-BobiverseIntakeIssue and wrong-book ban', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /Report-BobiverseIntakeIssue\.ps1/);
    assert.match(
      text,
      /Never park a-search product lessons under bobiverse harvest\/SKILL\.md/,
    );
    assert.match(text, /Out of scope for FR-046a/);
    assert.doesNotMatch(text, /<<<<<<<|=======|>>>>>>>/);
  });

  it('checklist table still names every FR-046a needle', () => {
    const text = fs.readFileSync(doc, 'utf8');
    for (const needle of [
      'CAST IRON',
      'intake',
      'POST https://irc.ntsa.uk/bob/v1/intake',
      '-Repo SimonBarnett/a-search',
      'honesty box',
    ]) {
      assert.ok(text.includes(needle), `missing needle: ${needle}`);
    }
  });
});

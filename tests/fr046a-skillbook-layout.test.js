'use strict';

/** FR-046a: skillbook-layout harvest CAST IRON checklist */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const doc = path.join(__dirname, '..', 'docs', 'skillbook-layout.md');

describe('FR-046a skillbook-layout harvest CAST IRON', () => {
  it('checklist mentions CAST IRON, intake, and a-search repo', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /CAST IRON harvest checklist/i);
    assert.match(text, /CAST IRON/);
    assert.match(text, /intake/i);
    assert.match(text, /POST https:\/\/irc\.ntsa\.uk\/bob\/v1\/intake/);
    assert.match(text, /-Repo SimonBarnett\/a-search/);
    assert.match(text, /honesty box/i);
  });
});

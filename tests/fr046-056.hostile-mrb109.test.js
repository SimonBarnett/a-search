'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const frDir = path.join(root, 'docs', 'fr');

describe('MRB #109 hostile: Phase-1b FR-046..056 backlog docs', () => {
  it('FR-046..056 each have Goal, Deliverables, Testable', () => {
    for (let i = 46; i <= 56; i++) {
      const name = `FR-${String(i).padStart(3, '0')}.md`;
      const text = fs.readFileSync(path.join(frDir, name), 'utf8');
      assert.match(text, /## Goal/);
      assert.match(text, /## Deliverables/);
      assert.match(text, /## Testable/);
    }
  });

  it('phase1b wave brief exists; cites opened issues; README lists FR-046..056', () => {
    const wave = fs.readFileSync(
      path.join(root, 'docs', 'feature-request-phase1b-2026-10-07.md'),
      'utf8',
    );
    assert.match(wave, /Q1|CAST IRON/);
    assert.match(wave, /#111|#121|111\.\.#121/);
    const readme = fs.readFileSync(path.join(frDir, 'README.md'), 'utf8');
    assert.match(readme, /FR-046/);
    assert.match(readme, /FR-056/);
  });
});
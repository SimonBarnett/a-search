'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const frDir = path.join(root, 'docs', 'fr');

describe('MRB #90 hostile: Phase-1 FR-031..045 backlog docs', () => {
  it('FR-031..045 each have Goal, Deliverables, Testable', () => {
    for (let i = 31; i <= 45; i++) {
      const name = `FR-${String(i).padStart(3, '0')}.md`;
      const text = fs.readFileSync(path.join(frDir, name), 'utf8');
      assert.match(text, /## Goal/);
      assert.match(text, /## Deliverables/);
      assert.match(text, /## Testable/);
    }
  });

  it('gap analysis + wave brief exist; wave points at opened issues', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'docs', 'gap-analysis-phase1-2026-10-07.md')),
    );
    const wave = fs.readFileSync(
      path.join(root, 'docs', 'feature-request-phase1-2026-10-07.md'),
      'utf8',
    );
    assert.match(wave, /P1|Maintainer schedule/);
    assert.match(wave, /#91|#105|91\.\.#105/);
    const readme = fs.readFileSync(path.join(frDir, 'README.md'), 'utf8');
    assert.match(readme, /FR-031/);
    assert.match(readme, /FR-045/);
  });
});
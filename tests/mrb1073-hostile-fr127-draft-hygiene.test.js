'use strict';

/** docs/mrb-1073: hostile pins for FR-127 stale draft harvest hygiene (PR #1073). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1073 hostile FR-127 draft harvest hygiene', () => {
  it('FR-127 park Decision LOCKED with covering refs for #613 and #726', () => {
    const t = read('docs/fr/FR-127.md');
    assert.match(t, /Decision\s*\(LOCKED\)/i);
    assert.match(t, /#613/);
    assert.match(t, /#726/);
    assert.match(t, /CLOSED[\s\S]{0,40}superseded|superseded/i);
    assert.match(t, /phase2-providers\.md|FR-061/);
    assert.match(t, /#725|FR-085/);
    assert.match(t, /Do not merge this tip|do not merge/i);
  });

  it('gap-analysis records FR-127 hygiene done', () => {
    const t = read('docs/gap-analysis-phase3-2026-10-09.md');
    assert.match(t, /FR-127/);
    assert.match(t, /#613/);
    assert.match(t, /#726/);
    assert.match(t, /CLOSED superseded|CLOSED.*superseded/i);
  });

  it('product fr127 pin remains on main', () => {
    const p = path.join(root, 'tests', 'fr127-stale-draft-harvest-prs.test.js');
    assert.ok(fs.existsSync(p));
    const t = fs.readFileSync(p, 'utf8');
    assert.match(t, /#613/);
    assert.match(t, /#726/);
    assert.match(t, /intake-harvest/);
  });

  it('intake-harvest 613/726 receipt filenames stay off main tree', () => {
    const intakeDir = path.join(root, 'docs', 'intake-harvest');
    if (!fs.existsSync(intakeDir)) {
      assert.ok(true);
      return;
    }
    const names = fs.readdirSync(intakeDir);
    assert.ok(!names.includes('intake-in_0644741d834b49d1.md'));
    assert.ok(!names.includes('intake-in_c661cfef258b489a.md'));
  });
});

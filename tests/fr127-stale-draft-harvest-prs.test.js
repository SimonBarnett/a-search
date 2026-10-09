'use strict';

/**
 * FR-127: stale draft harvest PRs #613 and #726 closed as superseded.
 * Pin documents Decision + covering refs (gh state verified at implement time).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR-127 stale draft harvest PR hygiene', () => {
  it('docs/fr/FR-127.md Decision records both PRs closed as superseded', () => {
    const text = utf8NoBom('docs/fr/FR-127.md');
    assert.match(text, /Decision\s*\(LOCKED\)/i);
    assert.match(text, /#613/);
    assert.match(text, /#726/);
    assert.match(text, /CLOSED|closed|superseded/i);
    assert.match(text, /phase2-providers\.md|FR-061/i);
    assert.match(text, /#725|FR-085|#638/);
  });

  it('phase3 umbrella lists FR-127 hygiene slice', () => {
    const text = utf8NoBom(
      'docs/feature-request-phase3-unlock-2026-10-09.md',
    );
    assert.match(text, /FR-127/);
  });

  it('intake-harvest receipt tips for 613/726 are not on main tree', () => {
    const intakeDir = path.join(root, 'docs', 'intake-harvest');
    if (!fs.existsSync(intakeDir)) {
      assert.ok(true, 'no intake-harvest dir (expected)');
      return;
    }
    const names = fs.readdirSync(intakeDir);
    assert.ok(
      !names.includes('intake-in_0644741d834b49d1.md'),
      'draft #613 receipt must not land on main',
    );
    assert.ok(
      !names.includes('intake-in_c661cfef258b489a.md'),
      'draft #726 receipt must not land on main',
    );
  });
});

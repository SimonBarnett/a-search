'use strict';

/**
 * Hostile pins for MRB #1296 / FR-159 shared package files[] identity/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'shared', 'package.json');
const frPath = path.join(root, 'docs', 'fr', 'FR-159.md');
const gapPath = path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md');

describe('MRB-1296 hostile FR-159 shared files identity', () => {
  it('files includes identity/ contiguous entry', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.files.includes('identity/'));
    const raw = fs.readFileSync(pkgPath, 'utf8');
    assert.ok(raw.includes('"identity/"'));
  });

  it('Decision LOCKED and release-gap Yes for FR-159', () => {
    const fr = fs.readFileSync(frPath, 'utf8');
    assert.ok(fr.includes('## Decision (LOCKED)'));
    assert.ok(fr.includes('identity/'));
    const gap = fs.readFileSync(gapPath, 'utf8');
    assert.match(
      gap,
      /shared files\[\] missing identity\/ \| FR-159 \| #1002 \(\*\*Yes\*\* - identity\/ in files; pin fr159\)/,
    );
  });
});

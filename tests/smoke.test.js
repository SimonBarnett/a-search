'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('a-search root scaffold', () => {
  it('package.json names a-search, is private, and requires Node >=20', () => {
    const pkgPath = path.join(root, 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'package.json must exist at repo root');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, 'a-search');
    assert.equal(pkg.private, true);
    assert.ok(pkg.engines && typeof pkg.engines.node === 'string');
    assert.match(pkg.engines.node, />=\s*20/);
    assert.ok(pkg.scripts && typeof pkg.scripts.test === 'string');
    assert.match(pkg.scripts.test, /node --test|node:test|run-tests\.js/);
  });

  it('smoke: scaffold test runner is alive', () => {
    assert.equal(1 + 1, 2);
  });
});

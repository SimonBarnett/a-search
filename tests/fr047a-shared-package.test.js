'use strict';

/** FR-047a: shared/ Node package skeleton */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const pkgPath = path.join(sharedDir, 'package.json');
const readmePath = path.join(sharedDir, 'README.md');

describe('FR-047a shared/ package skeleton', () => {
  it('shared/package.json exists with @a-search/shared name', () => {
    assert.ok(fs.existsSync(sharedDir));
    assert.ok(fs.existsSync(pkgPath));
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, '@a-search/shared');
    assert.ok(pkg.main);
  });

  it('shared/README.md points at Lambda layer path', () => {
    assert.ok(fs.existsSync(readmePath));
    const text = fs.readFileSync(readmePath, 'utf8');
    assert.match(text, /\/opt\/nodejs\/a-search/);
    assert.match(text, /@a-search\/shared/);
  });

  it('can require package by name via shared/package.json main', () => {
    const shared = require(path.join(sharedDir, 'index.js'));
    assert.equal(shared.name, '@a-search/shared');
    assert.equal(shared.layerPath, '/opt/nodejs/a-search');
  });

  it('root package.json depends on file:shared as @a-search/shared', () => {
    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    assert.equal(rootPkg.dependencies['@a-search/shared'], 'file:shared');
  });
});

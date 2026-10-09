'use strict';

/**
 * FR-151: jose is a root dependency and staged into the entry Lambda asset for JWT_JWKS_URL.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const {
  stageEntryLambdaAsset,
  requiredEntryAssetPaths,
} = require('../scripts/stage-entry-lambda-asset');

describe('FR-151 jose entry asset for JWT_JWKS_URL', () => {
  it('package.json lists jose dependency', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    assert.ok(pkg.dependencies && pkg.dependencies.jose, 'jose missing from dependencies');
    assert.match(String(pkg.dependencies.jose), /\d/);
  });

  it('stage-entry-lambda-asset.js copies node_modules/jose (FR-151)', () => {
    const src = fs.readFileSync(
      path.join(root, 'scripts', 'stage-entry-lambda-asset.js'),
      'utf8',
    );
    assert.match(src, /FR-151/);
    assert.match(src, /node_modules['"],\s*['"]jose['"]|['"]jose['"]/);
    assert.match(src, /requiredEntryAssetPaths|jose/);
  });

  it('requiredEntryAssetPaths includes node_modules/jose/package.json', () => {
    const paths = requiredEntryAssetPaths();
    assert.ok(
      paths.includes('node_modules/jose/package.json'),
      'requiredEntryAssetPaths must list jose',
    );
  });

  it('staged asset resolves jose (createRemoteJWKSet present)', () => {
    const joseSrc = path.join(root, 'node_modules', 'jose');
    assert.ok(
      fs.existsSync(path.join(joseSrc, 'package.json')),
      'repo node_modules/jose required (npm install)',
    );

    const outDir = path.join(root, 'cdk', 'entry-lambda-asset-fr151');
    fs.rmSync(outDir, { recursive: true, force: true });
    stageEntryLambdaAsset(root, { outDir });

    const stagedPkg = path.join(outDir, 'node_modules', 'jose', 'package.json');
    assert.ok(fs.existsSync(stagedPkg), 'staged jose package.json missing');

    // Resolve jose from the staged asset root the way Lambda would.
    const resolve = Module.createRequire(path.join(outDir, 'entry', 'src', 'auth', 'jwt.js'));
    const jose = resolve('jose');
    assert.equal(typeof jose.createRemoteJWKSet, 'function');
    assert.equal(typeof jose.jwtVerify, 'function');

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('FR-151 Decision LOCKED + release-gap pass2 Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-151.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr151-jose-entry-asset\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /FR-151/);
    assert.match(gap, /jose[^\n]*\*\*Yes\*\*/i);
  });
});

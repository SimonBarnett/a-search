'use strict';

/**
 * FR #4078: stage-parts-gateway npm-installs full @aws-sdk client trees.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  stagePartsGatewayLambdaAsset,
  readRootSdkVersions,
} = require('../scripts/stage-parts-gateway-lambda-asset');

const ROOT = path.join(__dirname, '..');

describe('FR #4078 stage-parts-gateway full SDK tree', () => {
  it('stage script npm-installs client-s3 + client-sqs (no cherry-pick list)', () => {
    const stage = fs.readFileSync(
      path.join(ROOT, 'scripts', 'stage-parts-gateway-lambda-asset.js'),
      'utf8',
    );
    assert.match(stage, /FR #4078/);
    assert.match(stage, /npm[\s\S]*install/);
    assert.match(stage, /@aws-sdk\/client-s3/);
    assert.match(stage, /@aws-sdk\/client-sqs/);
    assert.doesNotMatch(
      stage,
      /middleware-sdk-s3[\s\S]*bowser[\s\S]*fast-xml-parser/,
    );
  });

  it('readRootSdkVersions follows root package.json', () => {
    const v = readRootSdkVersions(ROOT);
    assert.match(String(v.s3), /3\./);
    assert.match(String(v.sqs), /3\./);
  });

  it('staged asset package.json lists both clients; npmInstall runs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4078-stage-'));
    let installedCwd = '';
    const out = stagePartsGatewayLambdaAsset(ROOT, {
      outDir: tmp,
      npmInstall: (cwd) => {
        installedCwd = cwd;
      },
    });
    assert.equal(out, tmp);
    assert.equal(installedCwd, tmp);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'),
    );
    assert.ok(pkg.dependencies['@aws-sdk/client-s3']);
    assert.ok(pkg.dependencies['@aws-sdk/client-sqs']);
    assert.ok(
      fs.existsSync(path.join(tmp, 'parts-gateway', 'src', 'handler.js')),
    );
    assert.ok(fs.existsSync(path.join(tmp, 'shared', 'aClubs')));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('real npm install leaves transitive checksums + smithy modules', async (t) => {
    // Skip when npm is unavailable (local seats without network).
    try {
      require('node:child_process').execFileSync('npm', ['--version'], {
        shell: true,
        stdio: 'pipe',
      });
    } catch {
      t.skip('npm not available');
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4078-npm-'));
    try {
      stagePartsGatewayLambdaAsset(ROOT, { outDir: tmp });
      const nm = path.join(tmp, 'node_modules');
      assert.ok(
        fs.existsSync(path.join(nm, '@aws-sdk', 'client-s3')),
        'client-s3',
      );
      assert.ok(
        fs.existsSync(path.join(nm, '@aws-sdk', 'client-sqs')),
        'client-sqs',
      );
      // Transitive modules that were missing on redqueen live smoke (#4078).
      const checksums = path.join(nm, '@aws-sdk', 'checksums');
      const smithy = path.join(nm, '@smithy');
      assert.ok(
        fs.existsSync(checksums) || fs.existsSync(smithy),
        'expected @aws-sdk/checksums and/or @smithy after npm install',
      );
      assert.ok(fs.existsSync(smithy), '@smithy present');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

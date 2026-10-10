'use strict';

/**
 * FR-165: explicit Lambda memorySize floors (entry 256, workers 256/512).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRegistry } = require('../providers/loadRegistry');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-165 Lambda memorySize floors', () => {
  it('stack constants and source wire memorySize', () => {
    const {
      ENTRY_LAMBDA_MEMORY_MB,
      WORKER_LAMBDA_MEMORY_MB,
      WORKER_MSSQL_LAMBDA_MEMORY_MB,
      HEAVY_LAMBDA_MEMORY_MB,
    } = require('../cdk/lib/a-search-stack');
    assert.equal(ENTRY_LAMBDA_MEMORY_MB, 256);
    assert.equal(WORKER_LAMBDA_MEMORY_MB, 256);
    assert.equal(WORKER_MSSQL_LAMBDA_MEMORY_MB, 512);
    assert.equal(HEAVY_LAMBDA_MEMORY_MB, 512);
    assert.ok(ENTRY_LAMBDA_MEMORY_MB > 128);
    assert.ok(WORKER_MSSQL_LAMBDA_MEMORY_MB >= WORKER_LAMBDA_MEMORY_MB);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-165/);
    assert.match(text, /memorySize:\s*ENTRY_LAMBDA_MEMORY_MB/);
    assert.match(text, /memorySize:\s*workerMemoryMb/);
    assert.match(text, /memorySize:\s*HEAVY_LAMBDA_MEMORY_MB/);
  });

  it('synth: entry/workers/maintainer/onboarding MemorySize match floors', () => {
    const cdk = require('aws-cdk-lib');
    const {
      ASearchStack,
      ENTRY_LAMBDA_MEMORY_MB,
      WORKER_LAMBDA_MEMORY_MB,
      WORKER_MSSQL_LAMBDA_MEMORY_MB,
      HEAVY_LAMBDA_MEMORY_MB,
      isLocalProviderFolder,
    } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr165');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing template');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};

    function memoryOf(functionName) {
      const hit = Object.entries(resources).find(([, res]) => {
        return (
          res &&
          res.Type === 'AWS::Lambda::Function' &&
          res.Properties &&
          res.Properties.FunctionName === functionName
        );
      });
      assert.ok(hit, `missing Lambda ${functionName}`);
      return Number(hit[1].Properties.MemorySize);
    }

    assert.equal(memoryOf('a-search-entry'), ENTRY_LAMBDA_MEMORY_MB);

    const registry = loadRegistry();
    const enabled = (registry.sources || []).filter(
      (s) => s && (s.enabled?.live || s.enabled?.sandbox),
    );
    assert.ok(enabled.length >= 6, 'expected enabled shortlist sources');

    for (const src of enabled) {
      const want = isLocalProviderFolder(src.folder)
        ? WORKER_MSSQL_LAMBDA_MEMORY_MB
        : WORKER_LAMBDA_MEMORY_MB;
      for (const env of ['live', 'sandbox']) {
        if (!src.enabled?.[env]) continue;
        const name = `a-search-${src.id}-worker-${env}`;
        assert.equal(
          memoryOf(name),
          want,
          `${name} MemorySize (local=${isLocalProviderFolder(src.folder)})`,
        );
      }
    }

    assert.equal(memoryOf('a-search-maintainer-live'), HEAVY_LAMBDA_MEMORY_MB);
    assert.equal(
      memoryOf('a-search-maintainer-sandbox'),
      HEAVY_LAMBDA_MEMORY_MB,
    );
    assert.equal(
      memoryOf('a-search-awin-onboarding-live'),
      HEAVY_LAMBDA_MEMORY_MB,
    );
    assert.equal(
      memoryOf('a-search-impact-onboarding-sandbox'),
      HEAVY_LAMBDA_MEMORY_MB,
    );
  });

  it('FR-165 Decision LOCKED + deploy.md + release-gap Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-165.md'), 'utf8');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr165-lambda-memory-size\.test\.js/);
    assert.match(fr, /ENTRY_LAMBDA_MEMORY_MB|256/);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(fr), 'FR-165.md ASCII');

    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /FR-165/);
    assert.match(deploy, /memorySize/);
    assert.match(deploy, /ENTRY_LAMBDA_MEMORY_MB|256/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /Explicit Lambda memorySize[^\n]*FR-165[^\n]*\*\*Yes\*\*/i,
    );
  });
});

'use strict';

/**
 * FR #3764: synth once per default stack config; reuse cdk.out read-only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  allocateSynthOutDir,
  sharedSynthOutDir,
  synthArtifactReady,
  runCdkSynth,
  DEFAULT_SHARED_SYNTH_KEY,
} = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const helperPath = path.join(__dirname, 'helpers', 'runCdkSynth.js');

describe('FR-3764 shared synth cache', () => {
  it('helper pins sharedSynthOutDir + synthArtifactReady + reuse path (ASCII no BOM)', () => {
    const buf = fs.readFileSync(helperPath);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /function sharedSynthOutDir/);
    assert.match(text, /function synthArtifactReady/);
    assert.match(text, /function ensureDefaultStackSynth/);
    assert.match(text, /reused:\s*true/);
    assert.match(text, /opts\.fresh/);
    assert.match(text, /FR #3764|FR-3764/);
  });

  it('sharedSynthOutDir is stable; allocateSynthOutDir stays unique (FR #3462)', () => {
    const a = sharedSynthOutDir(root);
    const b = sharedSynthOutDir(root, DEFAULT_SHARED_SYNTH_KEY);
    assert.equal(a, b);
    assert.match(path.basename(a), /^cdk\.out-shared-/);
    assert.notEqual(path.resolve(a), path.resolve(root, 'cdk.out'));
    const u1 = allocateSynthOutDir(root);
    const u2 = allocateSynthOutDir(root);
    assert.notEqual(u1, u2);
  });

  it('runCdkSynth reuses a ready shared outDir without a fresh synth', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3764-synth-'));
    try {
      const shared = sharedSynthOutDir(tmpRoot);
      fs.mkdirSync(shared, { recursive: true });
      fs.writeFileSync(
        path.join(shared, 'ASearchStack.template.json'),
        JSON.stringify({ Resources: {} }),
        'utf8',
      );
      assert.equal(synthArtifactReady(shared), true);
      const started = Date.now();
      const r = runCdkSynth(tmpRoot, { timeout: 5_000 });
      const elapsed = Date.now() - started;
      assert.equal(r.status, 0, r.stderr || r.stdout);
      assert.equal(r.reused, true);
      assert.equal(path.resolve(r.outDir), path.resolve(shared));
      assert.ok(elapsed < 2_000, `reuse must be fast, took ${elapsed}ms`);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('opts.fresh selects allocateSynthOutDir path (not shared) in helper source', () => {
    const text = fs.readFileSync(helperPath, 'utf8');
    assert.match(
      text,
      /else if \(opts\.fresh\) \{\s*outDir = allocateSynthOutDir\(root\);/s,
    );
    const shared = sharedSynthOutDir(root);
    const fresh = allocateSynthOutDir(root);
    assert.notEqual(path.resolve(fresh), path.resolve(shared));
  });
});

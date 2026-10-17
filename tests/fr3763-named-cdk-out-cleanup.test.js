'use strict';

/**
 * FR #3763: named cdk.out-* dirs (cdk.out-fr142, cdk.out-fr153-default, …)
 * must be removed after synth tests — not only private cdk.out-<pid>-<seq>.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  isCdkOutStar,
  registerCdkOutDir,
  cleanupRegisteredCdkOutDirs,
  sweepCdkOutDirs,
} = require('./helpers/cdkOutCleanup');
const RUN_TESTS = path.join(__dirname, '..', 'scripts', 'run-tests.js');
const HELPER = path.join(__dirname, 'helpers', 'runCdkSynth.js');

describe('FR #3763 named cdk.out-* cleanup', () => {
  it('isCdkOutStar matches named and private dirs, not plain cdk.out', () => {
    assert.equal(isCdkOutStar('cdk.out-fr142'), true);
    assert.equal(isCdkOutStar('cdk.out-fr153-default'), true);
    assert.equal(isCdkOutStar('cdk.out-1234-1'), true);
    assert.equal(isCdkOutStar('cdk.out'), false);
    assert.equal(isCdkOutStar('something-else'), false);
  });

  it('sweepCdkOutDirs removes named leftovers and keeps plain cdk.out', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3763-sweep-'));
    try {
      const named = path.join(root, 'cdk.out-fr142');
      const named2 = path.join(root, 'cdk.out-fr153-default');
      const plain = path.join(root, 'cdk.out');
      fs.mkdirSync(named);
      fs.mkdirSync(named2);
      fs.mkdirSync(plain);
      fs.writeFileSync(path.join(named, 'big.bin'), Buffer.alloc(1024));
      fs.writeFileSync(path.join(plain, 'keep.txt'), 'x');
      const removed = sweepCdkOutDirs(root);
      assert.ok(removed.includes('cdk.out-fr142'));
      assert.ok(removed.includes('cdk.out-fr153-default'));
      assert.equal(fs.existsSync(named), false);
      assert.equal(fs.existsSync(named2), false);
      assert.equal(fs.existsSync(plain), true, 'plain cdk.out must stay');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('registerCdkOutDir + cleanupRegistered removes named App outdirs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3763-reg-'));
    try {
      const dir = path.join(root, 'cdk.out-fr148');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'ASearchStack.template.json'), '{}');
      registerCdkOutDir(dir);
      assert.equal(fs.existsSync(dir), true);
      cleanupRegisteredCdkOutDirs();
      assert.equal(fs.existsSync(dir), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runCdkSynth registers named opts.outDir for cleanup', () => {
    const text = fs.readFileSync(HELPER, 'utf8');
    assert.match(text, /registerCdkOutDir/);
    assert.match(text, /cdkOutCleanup/);
    // Named outDir path is registered even when caller supplies it.
    assert.match(
      text,
      /registerCdkOutDir\(\s*outDir\s*\)|registerCdkOutDir\(outDir\)/,
    );
  });

  it('run-tests.js sweeps cdk.out-* after each batch', () => {
    const text = fs.readFileSync(RUN_TESTS, 'utf8');
    assert.match(text, /sweepCdkOutDirs/);
    assert.match(text, /cdkOutCleanup/);
  });

  it('A_SEARCH_KEEP_CDK_OUT=1 skips sweep', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3763-keep-'));
    const prev = process.env.A_SEARCH_KEEP_CDK_OUT;
    try {
      const named = path.join(root, 'cdk.out-fr155');
      fs.mkdirSync(named);
      process.env.A_SEARCH_KEEP_CDK_OUT = '1';
      assert.deepEqual(sweepCdkOutDirs(root), []);
      assert.equal(fs.existsSync(named), true);
    } finally {
      if (prev === undefined) delete process.env.A_SEARCH_KEEP_CDK_OUT;
      else process.env.A_SEARCH_KEEP_CDK_OUT = prev;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('child process exit cleans a registered named dir (integration)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3763-exit-'));
    const dir = path.join(root, 'cdk.out-fr162');
    const script = `
const fs = require('fs');
const path = require('path');
const { registerCdkOutDir } = require(${JSON.stringify(
      path.join(__dirname, 'helpers', 'cdkOutCleanup.js'),
    )});
const dir = ${JSON.stringify(dir)};
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'x'), '1');
registerCdkOutDir(dir);
`;
    try {
      const r = spawnSync(process.execPath, ['-e', script], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(fs.existsSync(dir), false, 'exit hook must remove named dir');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

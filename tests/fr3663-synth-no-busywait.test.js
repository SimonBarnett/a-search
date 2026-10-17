'use strict';

/**
 * #3665 follow-up to FR #3663: spawnSyncTreeKill must return as soon as the
 * child exits. The #3665 version busy-waited (Atomics.wait loop) on async
 * child events, which blocked the event loop: `close` never fired, so every
 * synth waited the full 600s timeout and then failed. Real-child pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DEFAULT_SYNTH_TIMEOUT_MS,
  spawnSyncTreeKill,
} = require('./helpers/runCdkSynth');

const HELPER = path.join(__dirname, 'helpers', 'runCdkSynth.js');

describe('FR-3663 / #3665 spawnSyncTreeKill does not busy-wait', () => {
  it('quick child returns in seconds, not near the timeout', () => {
    const t0 = Date.now();
    const r = spawnSyncTreeKill(
      process.execPath,
      ['-e', 'console.log("fr3663-ok"); console.error("fr3663-err")'],
      { cwd: os.tmpdir(), env: process.env, timeout: DEFAULT_SYNTH_TIMEOUT_MS },
    );
    const ms = Date.now() - t0;
    assert.ok(ms < 15_000, `quick child took ${ms}ms (busy-wait regression)`);
    assert.equal(r.error, null);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /fr3663-ok/);
    assert.match(r.stderr, /fr3663-err/);
  });

  it('non-zero exit code is passed through promptly', () => {
    const t0 = Date.now();
    const r = spawnSyncTreeKill(process.execPath, ['-e', 'process.exit(7)'], {
      cwd: os.tmpdir(),
      env: process.env,
      timeout: 120_000,
    });
    assert.ok(Date.now() - t0 < 15_000);
    assert.equal(r.status, 7);
    assert.equal(r.error, null);
  });

  it('tiny timeout on a hung child reports ETIMEDOUT quickly', () => {
    const t0 = Date.now();
    const r = spawnSyncTreeKill(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: os.tmpdir(),
      env: process.env,
      timeout: 300,
    });
    const ms = Date.now() - t0;
    assert.ok(ms < 15_000, `timeout path took ${ms}ms`);
    assert.ok(ms >= 250, `returned before timeout (${ms}ms)`);
    assert.equal(r.error && r.error.code, 'ETIMEDOUT');
    assert.notEqual(r.status, 0);
  });

  it('helper has no event-loop busy-wait', () => {
    const text = fs.readFileSync(HELPER, 'utf8');
    assert.doesNotMatch(text, /while\s*\(\s*!settled/);
    assert.doesNotMatch(text, /function sleepMs/);
  });

  it('runCdkSynth removes its private cdk.out-* dir at process exit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3663-root-'));
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'fr3663-fake', private: true, scripts: { synth: 'node fake-synth.js' } }),
      );
      // Fake synth: create the --output dir with a template, like cdk synth.
      fs.writeFileSync(
        path.join(root, 'fake-synth.js'),
        "const fs=require('fs');const p=require('path');const a=process.argv;const o=a[a.indexOf('--output')+1];" +
          "fs.mkdirSync(o,{recursive:true});fs.writeFileSync(p.join(o,'ASearchStack.template.json'),'{}');",
      );
      const script = `
const fs = require('fs');
const { runCdkSynth } = require(${JSON.stringify(HELPER)});
const r = runCdkSynth(${JSON.stringify(root)}, { timeout: 120000, fresh: true });
if (r.status !== 0) { console.error(r.stderr); process.exit(2); }
if (!fs.existsSync(require('path').join(r.outDir, 'ASearchStack.template.json'))) process.exit(3);
console.log('OUTDIR=' + r.outDir);
`;
      const t0 = Date.now();
      const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 120_000 });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.ok(Date.now() - t0 < 60_000);
      const m = r.stdout.match(/OUTDIR=(.+)/);
      assert.ok(m, r.stdout);
      const outDir = m[1].trim();
      assert.match(path.basename(outDir), /^cdk\.out-\d+-\d+$/);
      assert.equal(fs.existsSync(outDir), false, 'cdk.out-* must be removed on exit');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

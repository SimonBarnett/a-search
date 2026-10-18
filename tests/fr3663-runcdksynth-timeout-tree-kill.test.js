'use strict';

/**
 * FR #3663: runCdkSynth default timeout 600s; timeout kills the process tree
 * so orphan cdk cannot hold a cdk.out lock.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  DEFAULT_SYNTH_TIMEOUT_MS,
  killProcessTree,
  spawnSyncTreeKill,
} = require('./helpers/runCdkSynth');

const helperPath = path.join(__dirname, 'helpers', 'runCdkSynth.js');

describe('FR-3663 runCdkSynth timeout + process-tree kill', () => {
  it('default synth timeout is 600_000 ms', () => {
    assert.equal(DEFAULT_SYNTH_TIMEOUT_MS, 600_000);
    const text = fs.readFileSync(helperPath, 'utf8');
    assert.match(text, /DEFAULT_SYNTH_TIMEOUT_MS\s*=\s*600_000/);
    assert.match(text, /killProcessTree|taskkill/);
    assert.doesNotMatch(text, /opts\.timeout\s*\?\?\s*180_000/);
  });

  it('fr2021 accepts ci.yml expression timeout-minutes with 180', () => {
    const fr2021 = fs.readFileSync(
      path.join(__dirname, 'fr2021-ci-queue-starvation.test.js'),
      'utf8',
    );
    assert.match(fr2021, /timeout-minutes:\[\^\\n\]\*\\b180\\b/);
    assert.doesNotMatch(fr2021, /timeout-minutes:\\s\*180/);
  });

  it('spawnSyncTreeKill timeout kills descendant that outlives the parent shell', () => {
    const marker = path.join(
      os.tmpdir(),
      `fr3663-alive-${process.pid}-${Date.now()}.flag`,
    );
    try {
      if (fs.existsSync(marker)) fs.unlinkSync(marker);
      // Child writes marker then sleeps forever; grandchild keeps rewriting it.
      // If tree-kill works, marker stops updating after timeout.
      const childScript = `
const fs = require('fs');
const { spawn } = require('child_process');
const marker = ${JSON.stringify(marker)};
fs.writeFileSync(marker, 'parent');
const g = spawn(process.execPath, ['-e', ${JSON.stringify(
        `const fs=require('fs');const m=${JSON.stringify(marker)};setInterval(()=>fs.writeFileSync(m,'g-'+Date.now()),100);`,
      )}], { stdio: 'ignore', detached: process.platform !== 'win32' });
if (g.unref) g.unref();
setInterval(() => {}, 1000);
`;
      const r = spawnSyncTreeKill(process.execPath, ['-e', childScript], {
        cwd: os.tmpdir(),
        env: process.env,
        timeout: 800,
      });
      assert.ok(r.error || r.signal || r.status !== 0, 'timed-out run must not look successful');
      assert.equal(r.error && r.error.code, 'ETIMEDOUT');

      // Wait briefly; if orphan survived it would keep rewriting marker.
      const before = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
      spawnSync(process.execPath, ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,400)'], {
        timeout: 600,
        windowsHide: true,
      });
      const after = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
      if (after !== before) {
        // tree-kill can land inside writeFileSync and leave a truncated marker.
        // A live grandchild rewrites every 100ms, so one more settle must stay put.
        spawnSync(process.execPath, ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,400)'], {
          timeout: 600,
          windowsHide: true,
        });
        const later = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
        assert.equal(later, after, 'orphan grandchild must not keep updating marker after tree kill');
      }
    } finally {
      try {
        if (fs.existsSync(marker)) fs.unlinkSync(marker);
      } catch {
        /* ignore */
      }
      // belt: nothing left from this pid pattern
      killProcessTree(0);
    }
  });
});

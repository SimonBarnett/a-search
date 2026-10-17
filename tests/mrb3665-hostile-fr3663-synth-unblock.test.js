'use strict';

/**
 * MRB #3665 hostile: FR-3663 / #3462 synth unblock pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HELPER = path.join(ROOT, 'tests/helpers/runCdkSynth.js');

describe('mrb3665 hostile: FR-3663 synth unblock', () => {
  it('runCdkSynth defaults 600s, allocates private --output, and tree-kills on Windows', () => {
    const text = fs.readFileSync(HELPER, 'utf8');
    assert.match(text, /DEFAULT_SYNTH_TIMEOUT_MS\s*=\s*600_000/);
    assert.match(text, /allocateSynthOutDir/);
    assert.match(text, /--output/);
    assert.match(text, /taskkill/);
    assert.match(text, /\/T/);
    assert.match(text, /spawnSyncTreeKill/);
  });

  it('fr2021 pin uses expression-tolerant timeout-minutes 180 regex', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'tests/fr2021-ci-queue-starvation.test.js'),
      'utf8',
    );
    assert.match(text, /timeout-minutes:\[\^\\n\]\*\\b180\\b/);
  });

  it('FR-3663.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'docs/fr/FR-3663.md'));
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /600/);
    assert.match(text, /allocateSynthOutDir|cdk\.out-/);
  });
});

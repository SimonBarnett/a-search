'use strict';

/**
 * FR-365: CDK npm run synth must use Node 18+ even when PATH has Node 8 first.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIN_MAJOR,
  resolveNodeBin,
  nodeMajor,
  envWithPinnedNode,
  runCdkSynth,
} = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('FR-365 CDK synth Node PATH pin', () => {
  it('resolveNodeBin returns Node >= 18 (prefer D:\\Tools\\node)', () => {
    const bin = resolveNodeBin();
    assert.ok(bin, 'expected a Node >= 18 binary (set A_SEARCH_NODE_BIN)');
    assert.ok(fs.existsSync(bin), bin);
    assert.ok(nodeMajor(bin) >= MIN_MAJOR, `${bin} major ${nodeMajor(bin)}`);
  });

  it('envWithPinnedNode puts the pinned node dir first on PATH', () => {
    const bin = resolveNodeBin();
    assert.ok(bin);
    const env = envWithPinnedNode(bin, {
      PATH: 'D:\\Program Files\\nodejs;C:\\Windows\\System32',
    });
    const first = String(env.PATH).split(path.delimiter)[0];
    assert.equal(path.resolve(first), path.resolve(path.dirname(bin)));
  });

  it('runCdkSynth exits 0 with PATH polluted by Node 8 first', () => {
    const bin = resolveNodeBin();
    assert.ok(bin);
    const prev = process.env.PATH;
    const oldNodeDir = 'D:\\Program Files\\nodejs';
    try {
      process.env.PATH = `${oldNodeDir}${path.delimiter}${prev}`;
      // sanity: default PATH node is too old for node:fs when Program Files is first
      if (fs.existsSync(path.join(oldNodeDir, 'node.exe'))) {
        const { spawnSync } = require('node:child_process');
        const probe = spawnSync(
          path.join(oldNodeDir, 'node.exe'),
          ['-e', "require('node:fs')"],
          { encoding: 'utf8' },
        );
        assert.notEqual(
          probe.status,
          0,
          'expected Program Files node to lack node:fs (fixture for this FR)',
        );
      }
      const r = runCdkSynth(root, { timeout: 180_000 });
      assert.equal(
        r.status,
        0,
        `synth failed under polluted PATH:\n${r.stderr || r.stdout}`,
      );
      assert.ok(r.nodeBin);
      assert.ok(nodeMajor(r.nodeBin) >= MIN_MAJOR);
    } finally {
      process.env.PATH = prev;
    }
  });

  it('cdk test files require runCdkSynth helper for npm run synth', () => {
    const testsDir = path.join(root, 'tests');
    const files = fs
      .readdirSync(testsDir)
      .filter((n) => n.endsWith('.test.js'));
    const offenders = [];
    for (const name of files) {
      const text = fs.readFileSync(path.join(testsDir, name), 'utf8');
      if (!text.includes("['run', 'synth']")) continue;
      if (!text.includes('helpers/runCdkSynth')) offenders.push(name);
    }
    assert.deepEqual(
      offenders,
      [],
      `synth spawns must use tests/helpers/runCdkSynth.js: ${offenders.join(', ')}`,
    );
  });
});

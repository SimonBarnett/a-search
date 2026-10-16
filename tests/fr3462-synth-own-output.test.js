'use strict';

/**
 * FR #3462: parallel CDK synths must not share one cdk.out lock.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  allocateSynthOutDir,
  synthNpmArgs,
} = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('FR-3462 each synth gets its own output directory', () => {
  it('two allocations differ and are not the shared cdk.out', () => {
    const a = allocateSynthOutDir(root);
    const b = allocateSynthOutDir(root);
    assert.notEqual(a, b);
    assert.notEqual(path.resolve(a), path.resolve(root, 'cdk.out'));
    assert.notEqual(path.resolve(b), path.resolve(root, 'cdk.out'));
    assert.match(path.basename(a), /^cdk\.out-/);
    assert.match(path.basename(b), /^cdk\.out-/);
  });

  it('npm synth args pass that directory as --output', () => {
    const dir = allocateSynthOutDir(root);
    const args = synthNpmArgs(dir);
    const out = args.indexOf('--output');
    assert.ok(out >= 0, args.join(' '));
    assert.equal(args[out + 1], dir);
    assert.ok(args.includes('synth'));
  });
});

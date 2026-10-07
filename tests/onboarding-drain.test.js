'use strict';

/** FR-049b: shared/onboarding/drain.js */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  drain,
  DrainError,
  DEFAULT_MAX_ITERATIONS,
} = require('../shared/onboarding/drain');

describe('FR-049b onboarding drain', () => {
  it('shared/onboarding/drain.js exists', () => {
    assert.ok(
      fs.existsSync(
        path.join(__dirname, '..', 'shared', 'onboarding', 'drain.js'),
      ),
    );
    assert.equal(typeof DEFAULT_MAX_ITERATIONS, 'number');
  });

  it('stops when remaining becomes 0 (three runOnce then drain)', async () => {
    let n = 3;
    const calls = [];
    const result = await drain({
      runOnce: async () => {
        calls.push(n);
        const remaining = n - 1;
        const processed = 1;
        n = remaining;
        return {
          processed,
          remaining,
          signups: remaining === 0 ? [{ merchantId: 'm1' }] : [],
        };
      },
    });
    assert.equal(calls.length, 3);
    assert.equal(result.ok, true);
    assert.equal(result.drained, true);
    assert.equal(result.capped, false);
    assert.equal(result.remaining, 0);
    assert.equal(result.iterations, 3);
    assert.equal(result.processed, 3);
    assert.equal(result.signups.length, 1);
    assert.equal(result.signups[0].merchantId, 'm1');
  });

  it('cap prevents infinite loop when remaining never hits 0', async () => {
    let ticks = 0;
    const result = await drain({
      maxIterations: 5,
      runOnce: async () => {
        ticks += 1;
        return { processed: 0, remaining: 99, signups: [] };
      },
    });
    assert.equal(ticks, 5);
    assert.equal(result.ok, false);
    assert.equal(result.drained, false);
    assert.equal(result.capped, true);
    assert.equal(result.iterations, 5);
    assert.equal(result.remaining, 99);
  });

  it('throws DrainError when runOnce missing', async () => {
    await assert.rejects(
      () => drain({}),
      (err) => err instanceof DrainError && err.code === 'missing_runOnce',
    );
  });
});

'use strict';

/**
 * FR-027 / vision S6: live/sandbox isolation at queue + results path + worker gate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { queueName } = require('../providers/queueName');
const { resultsKey } = require('../worker/lib/resultsPath');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../shared/assertEnv');

describe('FR-027 / S6 env-isolation-runtime', () => {
  it('live and sandbox queue names never share a name', () => {
    for (const id of ['amazon', 'ebay', 'awin', 'impact']) {
      const live = queueName(id, 'live');
      const sandbox = queueName(id, 'sandbox');
      assert.notEqual(live, sandbox);
      assert.match(live, /-live$/);
      assert.match(sandbox, /-sandbox$/);
    }
  });

  it('results keys are prefixed by env (sandbox job cannot write live path)', () => {
    const liveKey = resultsKey({
      env: 'live',
      source: 'amazon',
      userId: 'U1',
      catalogId: 1,
      searchId: 'srch_a',
    });
    const sandboxKey = resultsKey({
      env: 'sandbox',
      source: 'amazon',
      userId: 'U1',
      catalogId: 1,
      searchId: 'srch_a',
    });
    assert.match(liveKey, /^live\//);
    assert.match(sandboxKey, /^sandbox\//);
    assert.notEqual(liveKey, sandboxKey);
  });

  it('worker refuses wrong-env messages (cross-env enqueue/write blocked)', () => {
    assert.throws(
      () =>
        assertWorkerEnv(
          { env: 'live', source: 'amazon', searchId: 'srch_x' },
          'sandbox',
        ),
      (err) => err instanceof EnvIsolationError && err.code === 'env_mismatch',
    );
    assert.throws(
      () =>
        assertWorkerEnv(
          { env: 'sandbox', source: 'awin', searchId: 'srch_y' },
          'live',
        ),
      (err) => err instanceof EnvIsolationError && err.code === 'env_mismatch',
    );
  });
});

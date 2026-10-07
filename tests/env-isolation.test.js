'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { queueName } = require('../providers/queueName');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../worker/lib/assertEnv');

describe('FR-007 live vs sandbox isolation', () => {
  it('amazon/live queue name !== amazon/sandbox', () => {
    const live = queueName('amazon', 'live');
    const sandbox = queueName('amazon', 'sandbox');
    assert.notEqual(live, sandbox);
    assert.match(live, /live/);
    assert.match(sandbox, /sandbox/);
    assert.match(live, /amazon/);
    assert.match(sandbox, /amazon/);
  });

  it('queueName rejects invalid env', () => {
    assert.throws(() => queueName('amazon', 'prod'), /live|sandbox/);
  });

  it('sandbox worker + live message → reject', () => {
    assert.throws(
      () =>
        assertWorkerEnv(
          { env: 'live', source: 'amazon', searchId: 'srch_x' },
          'sandbox',
        ),
      (err) => err instanceof EnvIsolationError && err.code === 'env_mismatch',
    );
  });

  it('matching env accepts', () => {
    assert.doesNotThrow(() =>
      assertWorkerEnv(
        { env: 'sandbox', source: 'amazon', searchId: 'srch_x' },
        'sandbox',
      ),
    );
  });
});

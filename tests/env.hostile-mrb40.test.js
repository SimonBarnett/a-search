'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { queueName } = require('../providers/queueName');
const { assertWorkerEnv, EnvIsolationError } = require('../worker/lib/assertEnv');

describe('MRB #40 hostile: FR-007 env isolation', () => {
  it('amazon live queue name !== amazon sandbox', () => {
    assert.notEqual(queueName('amazon', 'live'), queueName('amazon', 'sandbox'));
    assert.equal(queueName('amazon', 'live'), 'a-search-amazon-live');
    assert.equal(queueName('amazon', 'sandbox'), 'a-search-amazon-sandbox');
  });

  it('sandbox worker + live message → env_mismatch', () => {
    assert.throws(
      () =>
        assertWorkerEnv(
          { env: 'live', source: 'amazon', searchId: 'srch_x' },
          'sandbox'
        ),
      (err) => err instanceof EnvIsolationError && err.code === 'env_mismatch'
    );
  });

  it('matching env passes', () => {
    assert.doesNotThrow(() =>
      assertWorkerEnv(
        { env: 'sandbox', source: 'amazon', searchId: 'srch_x' },
        'sandbox'
      )
    );
  });
});

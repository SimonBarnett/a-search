'use strict';

/** FR-051b: impact onboarding runOnce drains pending queue */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  runOnce,
  createMemoryPendingQueue,
} = require('../providers/local/impact/onboarding/src/run');

/** FR-051c emitSignupRow requires user_id (GenerateUniqueUserId). */
const newUserId = () => 'ABCD1234';

describe('FR-051b impact pending-queue drain', () => {
  it('empty queue → remaining 0, processed 0, signups []', async () => {
    const q = createMemoryPendingQueue([]);
    const out = await runOnce({
      newUserId,
      envVars: { A_SEARCH_ENV: 'sandbox' },
      ...q,
    });
    assert.equal(out.processed, 0);
    assert.equal(out.remaining, 0);
    assert.ok(Array.isArray(out.signups));
    assert.equal(out.signups.length, 0);
  });

  it('one pending row → processed 1 then remaining 0', async () => {
    const q = createMemoryPendingQueue([
      {
        Id: 1,
        Env: 'sandbox',
        MerchantId: 'imp-1',
        MerchantName: 'One Co',
        Status: 'pending',
      },
    ]);
    const out = await runOnce({
      newUserId,
      envVars: { A_SEARCH_ENV: 'sandbox' },
      ...q,
    });
    assert.equal(out.processed, 1);
    assert.equal(out.remaining, 0);
    assert.equal(out.signups.length, 1); // FR-051c emit; persist still FR-052
    assert.equal(q.rows[0].Status, 'done');
    assert.ok(q.rows[0].ProcessedAt);
  });

  it('batchSize 1 leaves remaining when more pending', async () => {
    const q = createMemoryPendingQueue([
      {
        Id: 10,
        Env: 'live',
        MerchantId: 'a',
        MerchantName: 'A',
        Status: 'pending',
      },
      {
        Id: 11,
        Env: 'live',
        MerchantId: 'b',
        MerchantName: 'B',
        Status: 'pending',
      },
    ]);
    const deps = {
      newUserId,
      envVars: { A_SEARCH_ENV: 'live' },
      batchSize: 1,
      ...q,
    };
    const first = await runOnce(deps);
    assert.equal(first.processed, 1);
    assert.equal(first.remaining, 1);
    const second = await runOnce(deps);
    assert.equal(second.processed, 1);
    assert.equal(second.remaining, 0);
  });

  it('filters by A_SEARCH_ENV / Env', async () => {
    const q = createMemoryPendingQueue([
      {
        Id: 1,
        Env: 'sandbox',
        MerchantId: 'sb',
        Status: 'pending',
      },
      {
        Id: 2,
        Env: 'live',
        MerchantId: 'lv',
        Status: 'pending',
      },
    ]);
    const out = await runOnce({
      newUserId,
      envVars: { A_SEARCH_ENV: 'sandbox' },
      ...q,
    });
    assert.equal(out.processed, 1);
    assert.equal(out.remaining, 0);
    assert.equal(q.rows.find((r) => r.Id === 1).Status, 'done');
    assert.equal(q.rows.find((r) => r.Id === 2).Status, 'pending');
  });

  it('injectable listPending / markProcessed / countRemaining used', async () => {
    const calls = { list: 0, mark: 0, count: 0 };
    const out = await runOnce({
      newUserId,
      envVars: { A_SEARCH_ENV: 'sandbox' },
      listPending: async () => {
        calls.list += 1;
        return [
          { Id: 99, Env: 'sandbox', MerchantId: 'x', Status: 'pending' },
        ];
      },
      markProcessed: async () => {
        calls.mark += 1;
      },
      countRemaining: async () => {
        calls.count += 1;
        return 0;
      },
    });
    assert.equal(calls.list, 1);
    assert.equal(calls.mark, 1);
    assert.equal(calls.count, 1);
    assert.equal(out.processed, 1);
    assert.equal(out.remaining, 0);
  });
});

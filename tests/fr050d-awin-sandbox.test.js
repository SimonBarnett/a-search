'use strict';

/** FR-050d: awin onboarding sandbox mode — no live Awin HTTP */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { runOnce } = require('../providers/local/awin/onboarding/src/run');
const { assertSignupRequiredKeys } = require('../providers/local/awin/onboarding/src/emitSignupRow');

describe('FR-050d awin onboarding sandbox', () => {
  it('sandbox fixture path emits signups without calling httpGet', async () => {
    let httpCalls = 0;
    const out = await runOnce({
      sandbox: true,
      sandboxProgrammes: [
        {
          id: '9001',
          name: 'Fixture Co',
          displayUrl: 'https://fixture.example',
          primarySector: 'Test',
        },
      ],
      httpGet: async () => {
        httpCalls += 1;
        throw new Error('live Awin HTTP must not run in sandbox');
      },
      newUserId: () => 'SANDUSR1',
    });

    assert.equal(httpCalls, 0);
    assert.equal(out.remaining, 0);
    assert.ok(out.processed >= 1);
    assert.ok(out.signups.length >= 1);
    assert.equal(assertSignupRequiredKeys(out.signups[0]), true);
    assert.equal(out.signups[0].env, 'sandbox');
    assert.equal(out.signups[0].advertiserId, '9001');
  });

  it('second sandbox tick stays drained (remaining=0) still without HTTP', async () => {
    let httpCalls = 0;
    const state = {};
    const deps = {
      sandbox: true,
      state,
      sandboxProgrammes: [{ id: '1', name: 'Once' }],
      httpGet: async () => {
        httpCalls += 1;
        throw new Error('no live HTTP');
      },
      newUserId: () => 'SANDUSR2',
    };
    const first = await runOnce(deps);
    const second = await runOnce(deps);
    assert.equal(httpCalls, 0);
    assert.equal(first.remaining, 0);
    assert.equal(second.remaining, 0);
    assert.equal(second.signups.length, 0);
  });
});

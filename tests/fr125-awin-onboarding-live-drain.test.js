'use strict';

/**
 * FR-125: Awin onboarding live HTTP drain (fixture-backed).
 * No live network — injectable httpGet + recorded fixtures only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runOnce } = require('../providers/local/awin/onboarding/src/run');
const {
  assertSignupRequiredKeys,
} = require('../providers/local/awin/onboarding/src/emitSignupRow');
const { drain } = require('../shared/onboarding/drain');

const fixturePath = path.join(
  __dirname,
  'fixtures',
  'awin-joined-programmes.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function liveEnv(extra = {}) {
  return {
    A_SEARCH_ENV: 'live',
    AWIN_API_TOKEN: 'test-token',
    AWIN_PUBLISHER_ID: '999',
    ...extra,
  };
}

function fixtureHttpGet() {
  let calls = 0;
  const httpGet = async (url, init) => {
    calls += 1;
    assert.match(String(url), /publishers\/999\/programmes/);
    assert.match(String(url), /relationship=joined/);
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    return { status: 200, body: fixture };
  };
  return {
    httpGet,
    callCount: () => calls,
  };
}

describe('FR-125 awin onboarding live HTTP drain', () => {
  it('live path is not a comment-only empty stub (source uses fetchJoinedProgrammes)', () => {
    const runSrc = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'providers',
        'local',
        'awin',
        'onboarding',
        'src',
        'run.js',
      ),
      'utf8',
    );
    assert.doesNotMatch(
      runSrc,
      /Live path not implemented[\s\S]{0,80}empty drain/i,
      'live path must no longer be the FR-049c empty-drain stub',
    );
    assert.match(runSrc, /fetchJoinedProgrammes/);
  });

  it('live fixture HTTP drain emits signups and exits remaining=0', async () => {
    const { httpGet, callCount } = fixtureHttpGet();
    const ids = ['LIVEUSR1', 'LIVEUSR2'];
    let uid = 0;
    const out = await runOnce({
      sandbox: false,
      env: liveEnv(),
      httpGet,
      newUserId: () => ids[uid++] || 'LIVEUSR9',
    });

    assert.ok(callCount() >= 1, 'live path must call injectable httpGet');
    assert.equal(out.remaining, 0);
    assert.equal(out.processed, 2);
    assert.equal(out.signups.length, 2);
    assert.equal(assertSignupRequiredKeys(out.signups[0]), true);
    assert.equal(out.signups[0].env, 'live');
    assert.equal(out.signups[0].advertiserId, '1001');
    assert.equal(out.signups[0].company_name, 'Acme Retail');
    assert.equal(out.signups[1].advertiserId, '1002');
  });

  it('second live tick stays drained (remaining=0) without re-emitting', async () => {
    const { httpGet, callCount } = fixtureHttpGet();
    const state = {};
    const deps = {
      sandbox: false,
      state,
      env: liveEnv(),
      httpGet,
      newUserId: () => 'LIVEUSR2',
    };
    const first = await runOnce(deps);
    const second = await runOnce(deps);
    assert.equal(first.remaining, 0);
    assert.equal(first.processed, 2);
    assert.equal(second.remaining, 0);
    assert.equal(second.processed, 0);
    assert.equal(second.signups.length, 0);
    assert.ok(callCount() >= 1);
  });

  it('batchSize leaves remaining then drains to 0 (S13 / shared drain)', async () => {
    const { httpGet } = fixtureHttpGet();
    const state = {};
    let uid = 0;
    const deps = {
      sandbox: false,
      state,
      env: liveEnv(),
      httpGet,
      batchSize: 1,
      newUserId: () => `BATCHUS${uid++}`.padEnd(8, '0').slice(0, 8),
    };

    const first = await runOnce(deps);
    assert.equal(first.processed, 1);
    assert.equal(first.remaining, 1);
    assert.equal(first.signups.length, 1);

    const result = await drain({
      maxIterations: 5,
      runOnce: () => runOnce(deps),
    });
    assert.equal(result.drained, true);
    assert.equal(result.remaining, 0);
    assert.ok(result.processed >= 1);
  });

  it('live without httpGet fails closed (no silent empty drain)', async () => {
    await assert.rejects(
      () =>
        runOnce({
          sandbox: false,
          env: liveEnv(),
          newUserId: () => 'LIVEFAIL1',
        }),
      (err) =>
        err &&
        (err.code === 'missing_httpGet' ||
          /httpGet|missing_httpGet/i.test(String(err.message || err))),
    );
  });

  it('sandbox still never calls httpGet (FR-050d regression)', async () => {
    let httpCalls = 0;
    const out = await runOnce({
      sandbox: true,
      sandboxProgrammes: [{ id: '1', name: 'Keep Sandbox' }],
      httpGet: async () => {
        httpCalls += 1;
        throw new Error('sandbox must not hit live HTTP');
      },
      newUserId: () => 'SANDKEEP',
    });
    assert.equal(httpCalls, 0);
    assert.equal(out.remaining, 0);
  });
});

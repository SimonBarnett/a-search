'use strict';

/** FR-050a: fetch Awin joined programmes */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  fetchJoinedProgrammes,
  AwinOnboardingError,
} = require('../providers/local/awin/onboarding/src/fetchJoinedProgrammes');

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'awin-joined-programmes.json'),
    'utf8',
  ),
);

describe('FR-050a awin fetchJoinedProgrammes', () => {
  it('fixture returns programme list', async () => {
    const calls = [];
    const out = await fetchJoinedProgrammes({
      env: {
        AWIN_API_TOKEN: 'test-token',
        AWIN_PUBLISHER_ID: '999',
      },
      httpGet: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, body: fixture };
      },
    });
    assert.equal(out.programmes.length, 2);
    assert.equal(out.programmes[0].id, '1001');
    assert.equal(out.programmes[0].name, 'Acme Retail');
    assert.equal(out.publisherId, '999');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /publishers\/999\/programmes/);
    assert.match(calls[0].url, /relationship=joined/);
    assert.equal(
      calls[0].init.headers.Authorization,
      'Bearer test-token',
    );
  });

  it('missing token errors', async () => {
    await assert.rejects(
      () =>
        fetchJoinedProgrammes({
          env: { AWIN_PUBLISHER_ID: '1' },
          httpGet: async () => ({ status: 200, body: [] }),
        }),
      (err) =>
        err instanceof AwinOnboardingError &&
        err.code === 'missing_awin_token',
    );
  });

  it('missing publisher id errors', async () => {
    await assert.rejects(
      () =>
        fetchJoinedProgrammes({
          env: { AWIN_API_TOKEN: 't' },
          httpGet: async () => ({ status: 200, body: [] }),
        }),
      (err) =>
        err instanceof AwinOnboardingError &&
        err.code === 'missing_awin_publisher',
    );
  });
});

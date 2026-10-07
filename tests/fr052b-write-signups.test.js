'use strict';

/** FR-052b: signup event writer — S3 JSON round-trip */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  writeSignupEvents,
  readSignupEvents,
  createMemorySignupsStore,
  normalizeSignup,
  signupsKey,
} = require('../shared/onboarding/writeSignups');

describe('FR-052b writeSignupEvents S3 JSON store', () => {
  it('signupsKey is {env}/_reports/{source}/{day}/signups.json', () => {
    assert.equal(
      signupsKey({ env: 'sandbox', source: 'awin', day: '2026-10-08' }),
      'sandbox/_reports/awin/2026-10-08/signups.json',
    );
  });

  it('write then read returns same signup id/fields', async () => {
    const store = createMemorySignupsStore();
    const envVars = { S3_RESULTS_BUCKET: 'a-search-results-test' };
    const row = {
      user_id: 'usr_1',
      company_name: 'Acme',
      email: 'Ops@Acme.Example',
      advertiserId: '1001',
      env: 'sandbox',
      source: 'awin',
      onboardedAt: '2026-10-08T12:00:00.000Z',
      status: 'joined',
    };

    const written = await writeSignupEvents({
      env: 'sandbox',
      source: 'awin',
      day: '2026-10-08',
      signups: [row],
      envVars,
      putObject: store.putObject,
      getObject: store.getObject,
    });

    assert.equal(written.key, 'sandbox/_reports/awin/2026-10-08/signups.json');
    assert.equal(written.written.length, 1);
    const id = written.written[0].id;
    assert.ok(id && id.startsWith('sig_'));

    const read = await readSignupEvents({
      env: 'sandbox',
      source: 'awin',
      day: '2026-10-08',
      envVars,
      getObject: store.getObject,
    });

    assert.equal(read.signups.length, 1);
    const got = read.signups[0];
    assert.equal(got.id, id);
    assert.equal(got.user_id, 'usr_1');
    assert.equal(got.company_name, 'Acme');
    assert.equal(got.email, 'ops@acme.example');
    assert.equal(got.advertiserId, '1001');
    assert.equal(got.env, 'sandbox');
    assert.equal(got.source, 'awin');
    assert.equal(got.onboardedAt, '2026-10-08T12:00:00.000Z');
    assert.equal(got.merchantId, '1001');
    assert.equal(got.signedUpAt, '2026-10-08T12:00:00.000Z');
  });

  it('merge by id on second write keeps prior signups', async () => {
    const store = createMemorySignupsStore();
    const envVars = { S3_RESULTS_BUCKET: 'b' };
    const deps = {
      env: 'live',
      source: 'impact',
      day: '2026-10-08',
      envVars,
      putObject: store.putObject,
      getObject: store.getObject,
    };

    await writeSignupEvents({
      ...deps,
      signups: [
        {
          id: 'sig_a',
          user_id: 'u1',
          company_name: 'A',
          email: 'a@x.y',
          advertiserId: '1',
          env: 'live',
        },
      ],
    });
    await writeSignupEvents({
      ...deps,
      signups: [
        {
          id: 'sig_b',
          user_id: 'u2',
          company_name: 'B',
          email: 'b@x.y',
          advertiserId: '2',
          env: 'live',
        },
      ],
    });

    const read = await readSignupEvents(deps);
    assert.equal(read.signups.length, 2);
    assert.ok(read.signups.some((s) => s.id === 'sig_a'));
    assert.ok(read.signups.some((s) => s.id === 'sig_b'));
  });

  it('normalizeSignup assigns stable id from fields', () => {
    const a = normalizeSignup({
      user_id: 'u',
      company_name: 'C',
      email: 'c@d.e',
      advertiserId: '9',
      env: 'sandbox',
      source: 'awin',
      onboardedAt: '2026-01-01T00:00:00.000Z',
    });
    const b = normalizeSignup({
      user_id: 'u',
      company_name: 'C',
      email: 'c@d.e',
      merchantId: '9',
      env: 'sandbox',
      source: 'awin',
      signedUpAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(a.id, b.id);
  });

  it('rejects missing S3_RESULTS_BUCKET', async () => {
    await assert.rejects(
      () =>
        writeSignupEvents({
          env: 'sandbox',
          source: 'awin',
          signups: [],
          envVars: {},
          putObject: async () => {},
          getObject: async () => {
            throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
          },
        }),
      /S3_RESULTS_BUCKET/,
    );
  });
});

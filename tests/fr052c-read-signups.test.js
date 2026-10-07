'use strict';

/** FR-052c: signup events reader lists only matching env/source/day */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  writeSignupEvents,
  createMemorySignupsStore,
} = require('../shared/onboarding/writeSignups');
const { listSignupEvents } = require('../shared/onboarding/readSignups');
const { signupsKey } = require('../shared/onboarding/signupsPath');

describe('FR-052c listSignupEvents for daily report', () => {
  it('returns only matching env/day (filters foreign rows in file)', async () => {
    const store = createMemorySignupsStore();
    const envVars = { S3_RESULTS_BUCKET: 'report-bucket' };
    const day = '2026-10-08';
    const key = signupsKey({ env: 'sandbox', source: 'awin', day });

    // Seed mixed rows directly into the day's object (simulates dirty file).
    await store.putObject({
      Bucket: 'report-bucket',
      Key: key,
      Body: JSON.stringify({
        env: 'sandbox',
        source: 'awin',
        day,
        signups: [
          {
            id: 'sig_ok',
            env: 'sandbox',
            source: 'awin',
            user_id: 'u1',
            company_name: 'Ok',
            email: 'ok@x.y',
            advertiserId: '1',
            onboardedAt: '2026-10-08T10:00:00.000Z',
          },
          {
            id: 'sig_wrong_env',
            env: 'live',
            source: 'awin',
            user_id: 'u2',
            company_name: 'Live',
            email: 'live@x.y',
            advertiserId: '2',
            onboardedAt: '2026-10-08T11:00:00.000Z',
          },
          {
            id: 'sig_wrong_day',
            env: 'sandbox',
            source: 'awin',
            user_id: 'u3',
            company_name: 'Yesterday',
            email: 'y@x.y',
            advertiserId: '3',
            onboardedAt: '2026-10-07T23:00:00.000Z',
          },
          {
            id: 'sig_wrong_source',
            env: 'sandbox',
            source: 'impact',
            user_id: 'u4',
            company_name: 'Impact',
            email: 'i@x.y',
            advertiserId: '4',
            onboardedAt: '2026-10-08T12:00:00.000Z',
          },
        ],
      }),
    });

    const listed = await listSignupEvents({
      env: 'sandbox',
      source: 'awin',
      day,
      envVars,
      getObject: store.getObject,
    });

    assert.equal(listed.env, 'sandbox');
    assert.equal(listed.source, 'awin');
    assert.equal(listed.day, day);
    assert.equal(listed.key, key);
    assert.equal(listed.signups.length, 1);
    assert.equal(listed.signups[0].id, 'sig_ok');
  });

  it('lists signups written for that env/source/day only', async () => {
    const store = createMemorySignupsStore();
    const envVars = { S3_RESULTS_BUCKET: 'b' };
    const deps = {
      envVars,
      putObject: store.putObject,
      getObject: store.getObject,
    };

    await writeSignupEvents({
      env: 'live',
      source: 'impact',
      day: '2026-10-08',
      signups: [
        {
          id: 'sig_live_8',
          user_id: 'u',
          company_name: 'Co',
          email: 'c@d.e',
          advertiserId: '9',
          env: 'live',
          source: 'impact',
          onboardedAt: '2026-10-08T01:00:00.000Z',
        },
      ],
      ...deps,
    });
    await writeSignupEvents({
      env: 'live',
      source: 'impact',
      day: '2026-10-09',
      signups: [
        {
          id: 'sig_live_9',
          user_id: 'u',
          company_name: 'Co2',
          email: 'c2@d.e',
          advertiserId: '10',
          env: 'live',
          source: 'impact',
          onboardedAt: '2026-10-09T01:00:00.000Z',
        },
      ],
      ...deps,
    });

    const day8 = await listSignupEvents({
      env: 'live',
      source: 'impact',
      day: '2026-10-08',
      ...deps,
    });
    assert.equal(day8.signups.length, 1);
    assert.equal(day8.signups[0].id, 'sig_live_8');

    const day9 = await listSignupEvents({
      env: 'live',
      source: 'impact',
      day: '2026-10-09',
      ...deps,
    });
    assert.equal(day9.signups.length, 1);
    assert.equal(day9.signups[0].id, 'sig_live_9');

    const sandbox = await listSignupEvents({
      env: 'sandbox',
      source: 'impact',
      day: '2026-10-08',
      ...deps,
    });
    assert.equal(sandbox.signups.length, 0);
  });

  it('empty day returns empty signups array', async () => {
    const store = createMemorySignupsStore();
    const listed = await listSignupEvents({
      env: 'sandbox',
      source: 'awin',
      day: '2099-01-01',
      envVars: { S3_RESULTS_BUCKET: 'b' },
      getObject: store.getObject,
    });
    assert.deepEqual(listed.signups, []);
  });
});

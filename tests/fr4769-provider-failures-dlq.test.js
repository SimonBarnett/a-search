'use strict';

/**
 * FR #4769: provider API failures must not write IN files; they fail into the
 * DLQ (Lambda throw + SQS maxReceiveCount). Success with 0 products still writes IN.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  handleSqsWith429,
  isProviderFaultForDlq,
} = require('../shared/search/handleSqsWith429');
const { run: runAmazon } = require('../providers/live/amazon/src/worker');
const { run: runCj } = require('../providers/live/cj/src/worker');
const {
  searchRakuten,
  resetRakutenTokenCache,
} = require('../providers/live/rakuten/src/search');

const creatorsEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  AMAZON_SEARCH_API: 'creators',
  AMAZON_CREATORS_CREDENTIAL: 'FAKE_creators_cred',
  AMAZON_CREATORS_MARKETPLACE: 'www.amazon.co.uk',
  AMAZON_PARTNER_TAG: 'fake-tag-21',
};

const cjEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  CJ_API_TOKEN: 'FAKE_cj_token',
  CJ_WEBSITE_ID: '12345',
};

const rakutenEnv = {
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
};

/**
 * @param {object} err
 * @param {string} source
 */
async function assertFailsToDlq(err, source) {
  const puts = [];
  const intake = [];
  const logs = [];
  await assert.rejects(
    () =>
      handleSqsWith429({
        event: {
          Records: [
            {
              body: JSON.stringify({
                searchId: 'srch_4769',
                searchid: 'srch_4769',
                hostkey: 'www.mymodelflyingclub.co.uk',
                host: 'www.mymodelflyingclub.co.uk',
                guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
                env: 'sandbox',
                source,
              }),
              receiptHandle: 'rh-4769',
            },
          ],
        },
        run: async () => {
          throw err;
        },
        deps: {
          putObject: async (args) => {
            puts.push(args);
            return {};
          },
          touchLastmod: async () => {},
        },
        reportException: async (args) => {
          intake.push(args);
        },
        logError: (...parts) => {
          logs.push(parts.join(' '));
        },
        source,
        route: 'providers/live/' + source + '/handler',
      }),
    (e) => e === err || (e && e.code === err.code),
  );
  assert.equal(puts.length, 0, 'no IN file on provider failure');
  assert.equal(intake.length, 0, 'no intake fatal on provider failure');
  assert.ok(logs.some((l) => /provider_failure/.test(l)));
  assert.ok(logs.some((l) => /srch_4769/.test(l)));
  assert.ok(logs.some((l) => new RegExp(source).test(l)));
}

describe('FR #4769 provider failures go to DLQ (no IN)', () => {
  it('classifies auth/eligibility/client faults for DLQ', () => {
    for (const code of [
      'creators_not_eligible',
      'cj_not_authorised',
      'rakuten_invalid_context',
      'paapi_non_json',
    ]) {
      const err = new Error(code);
      err.code = code;
      err.nonRetryable = true;
      assert.equal(isProviderFaultForDlq(err), true, code);
    }
    const miss = new Error('missing');
    miss.code = 'cj_missing_credentials';
    assert.equal(isProviderFaultForDlq(miss), false);
  });

  it('403 creators_not_eligible: no IN, throw, no intake', async () => {
    const err = new Error('Amazon Creators HTTP 403 AssociateNotEligible');
    err.status = 403;
    err.code = 'creators_not_eligible';
    err.nonRetryable = true;
    await assertFailsToDlq(err, 'amazon');
  });

  it('403 cj_not_authorised: no IN, throw, no intake', async () => {
    const err = new Error('CJ HTTP non-JSON 403: You are not Authorised');
    err.status = 403;
    err.code = 'cj_not_authorised';
    err.nonRetryable = true;
    await assertFailsToDlq(err, 'cj');
  });

  it('400 rakuten_invalid_context: no IN, throw, no intake', async () => {
    const err = new Error('Rakuten HTTP 400: INVALID_CONTEXT_VALUE');
    err.statusCode = 400;
    err.code = 'rakuten_invalid_context';
    err.nonRetryable = true;
    await assertFailsToDlq(err, 'rakuten');
  });

  it('5xx non-transient: no IN, throw', async () => {
    const err = new Error('vendor HTTP 500');
    err.status = 500;
    await assertFailsToDlq(err, 'ebay');
  });

  it('amazon worker 403 does not write IN', async () => {
    const puts = [];
    await assert.rejects(
      () =>
        runAmazon(
          {
            searchId: 'srch_amz',
            userId: 'U1',
            env: 'sandbox',
            source: 'amazon',
            q: 'servo',
            host: 'example.test',
            guid: 'g1',
          },
          {
            env: creatorsEnv,
            httpRequest: async () => {
              const err = new Error('Amazon Creators HTTP 403');
              err.status = 403;
              err.code = 'creators_not_eligible';
              err.nonRetryable = true;
              throw err;
            },
            putObject: async (args) => {
              puts.push(args);
              return {};
            },
          },
        ),
      (e) => e && e.code === 'creators_not_eligible',
    );
    assert.equal(puts.length, 0);
  });

  it('cj worker 403 does not write IN', async () => {
    const puts = [];
    await assert.rejects(
      () =>
        runCj(
          {
            searchId: 'srch_cj',
            userId: 'U1',
            env: 'sandbox',
            source: 'cj',
            q: 'servo',
            host: 'example.test',
            guid: 'g1',
          },
          {
            env: cjEnv,
            httpRequest: async () => {
              const err = new Error('CJ HTTP non-JSON 403: You are not Authorised');
              err.status = 403;
              err.code = 'cj_not_authorised';
              err.nonRetryable = true;
              throw err;
            },
            putObject: async (args) => {
              puts.push(args);
              return {};
            },
          },
        ),
      (e) => e && e.code === 'cj_not_authorised',
    );
    assert.equal(puts.length, 0);
  });

  it('rakuten INVALID_CONTEXT_VALUE throws (does not return [])', async () => {
    resetRakutenTokenCache();
    await assert.rejects(
      () =>
        searchRakuten(
          { q: 'shoes', userId: 'U-4769', env: 'live' },
          {
            env: rakutenEnv,
            httpRequest: async (req) => {
              if (String(req.url || '').includes('/token')) {
                return {
                  statusCode: 200,
                  body: JSON.stringify({
                    access_token: 'FAKE_access_token',
                    expires_in: 3600,
                  }),
                };
              }
              const err = new Error(
                'Rakuten HTTP 400: <Errors><ErrorID>INVALID_CONTEXT_VALUE</ErrorID></Errors>',
              );
              err.statusCode = 400;
              err.code = 'rakuten_invalid_context';
              throw err;
            },
          },
        ),
      (e) => e && e.code === 'rakuten_invalid_context',
    );
  });

  it('200 with 0 products still writes IN', async () => {
    const puts = [];
    const out = await runCj(
      {
        searchId: 'srch_empty',
        userId: 'U1',
        env: 'sandbox',
        source: 'cj',
        q: 'zzzz-no-match-4769',
        host: 'example.test',
        guid: 'g-empty',
      },
      {
        env: cjEnv,
        searchCj: async () => [],
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
        touchLastmod: async () => {},
      },
    );
    assert.equal(out.ok, true);
    assert.deepEqual(out.products, []);
    assert.ok(puts.length >= 1);
    const body = JSON.parse(Buffer.from(puts[0].Body).toString('utf8'));
    assert.deepEqual(body.products, []);
    assert.ok(!body.status && !body.error);
  });

  it('missing_credentials still acks with status IN (not a failure)', async () => {
    const puts = [];
    const err = new Error('no key');
    err.code = 'cj_missing_credentials';
    const result = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchid: 'srch_miss',
              hostkey: 'host1',
              guid: 'g1',
            }),
            receiptHandle: 'rh-m',
          },
        ],
      },
      run: async () => {
        throw err;
      },
      deps: {
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
        touchLastmod: async () => {},
      },
      logError: () => {},
      source: 'cj',
    });
    assert.equal(result.ok, true);
    assert.equal(result.results[0].skipped, 'missing_credentials');
    assert.equal(puts.length, 1);
  });
});

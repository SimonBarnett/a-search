'use strict';

/**
 * FR #4816: Creators live path matches madeira routes/paapi.js
 * (UK token + marketplace; LwA mint only; no host/region derivation).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  searchAmazonCreators,
  resolveCreatorsTokenUrl,
  resolveCreatorsMarketplace,
  assertCreatorsCreds,
  clearCreatorsTokenCache,
  cleanCreatorsKeywords,
} = require('../providers/live/amazon/src/creatorsSearch');
const {
  MADEIRA_ENV_PARAMS,
  fillMadeiraProviderEnv,
  resolveMadeiraSsmRegion,
  isMadeiraPlaceholder,
} = require('../cdk/lib/fill-madeira-ssm-env');
const { run } = require('../providers/live/amazon/src/worker');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');

const envUsLeftovers = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
  AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.com',
  AMAZON_REGION: 'us-east-1',
  AMAZON_CREATORS_CREDENTIAL: 'X',
  AMAZON_SEARCH_API: 'creators',
};

beforeEach(() => {
  clearCreatorsTokenCache();
});

describe('FR #4816 madeira Creators call parity', () => {
  it('token URL and marketplace stay UK despite US host/region leftovers', () => {
    assert.equal(
      resolveCreatorsTokenUrl(envUsLeftovers),
      'https://api.amazon.co.uk/auth/o2/token',
    );
    assert.equal(resolveCreatorsMarketplace(envUsLeftovers), 'www.amazon.co.uk');
    assert.equal(
      resolveCreatorsTokenUrl({ AMAZON_CREATORS_TOKEN_URL: 'https://example.test/token' }),
      'https://example.test/token',
    );
    assert.equal(
      resolveCreatorsMarketplace({ AMAZON_CREATORS_MARKETPLACE: 'www.amazon.de' }),
      'www.amazon.de',
    );
  });

  it('AMAZON_ASSOCIATE_TAG is accepted as partnerTag alias', () => {
    const c = assertCreatorsCreds({
      AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
      AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
      AMAZON_ASSOCIATE_TAG: 'madeira-21',
    });
    assert.equal(c.partnerTag, 'madeira-21');
  });

  it('live path mints LwA and never uses AMAZON_CREATORS_CREDENTIAL bearer', async () => {
    const calls = [];
    const products = await searchAmazonCreators(
      { searchId: 's', userId: 'U', env: 'sandbox', q: 'servo*' },
      {
        env: envUsLeftovers,
        sleep: async () => {},
        httpRequest: async (req) => {
          calls.push(req);
          if (String(req.url).includes('/auth/o2/token')) {
            assert.equal(req.url, 'https://api.amazon.co.uk/auth/o2/token');
            const body = JSON.parse(req.body);
            assert.equal(body.grant_type, 'client_credentials');
            assert.equal(body.client_id, 'FAKE_CLIENT_ID');
            assert.equal(body.client_secret, 'FAKE_CLIENT_SECRET');
            assert.equal(body.scope, 'creatorsapi::default');
            return { access_token: 'FAKE_MINTED', expires_in: 3600 };
          }
          assert.match(String(req.url), /creatorsapi\.amazon\/catalog\/v1\/searchItems/);
          assert.equal(req.headers['x-marketplace'], 'www.amazon.co.uk');
          assert.equal(req.headers.authorization, 'Bearer FAKE_MINTED');
          assert.notEqual(req.headers.authorization, 'Bearer X');
          const body = JSON.parse(req.body);
          assert.equal(body.keywords, 'servo');
          assert.equal(body.partnerTag, 'tag-20');
          assert.equal(body.marketplace, 'www.amazon.co.uk');
          assert.equal(body.itemPage, 1);
          assert.deepEqual(body.resources, [
            'images.primary.medium',
            'itemInfo.title',
            'offersV2.listings.price',
            'itemInfo.byLineInfo',
          ]);
          return { searchResult: { items: [] } };
        },
      },
    );
    assert.equal(products.length, 0);
    assert.ok(calls.some((c) => String(c.url).includes('/auth/o2/token')));
  });

  it('pages until fewer than 10 items; retries 429 after back-off', async () => {
    const pages = [];
    let slept = [];
    let threw429 = false;
    await searchAmazonCreators(
      { q: 'x', userId: 'U', env: 'sandbox' },
      {
        env: { ...envUsLeftovers, PAAPI_MAX_PAGES: '5' },
        sleep: async (ms) => {
          slept.push(ms);
        },
        httpRequest: async (req) => {
          if (String(req.url).includes('/auth/o2/token')) {
            return { access_token: 'FAKE_MINTED', expires_in: 3600 };
          }
          if (String(req.url).includes('/getItems')) {
            return { getItemsResult: { items: [] } };
          }
          const body = JSON.parse(req.body);
          pages.push(body.itemPage);
          if (body.itemPage === 1 && !threw429) {
            threw429 = true;
            const err = new Error('Amazon Creators HTTP 429');
            err.status = 429;
            throw err;
          }
          if (body.itemPage === 1) {
            return {
              searchResult: {
                items: Array.from({ length: 10 }, (_, i) => ({
                  asin: `B0P1${i}`,
                  itemInfo: { title: { displayValue: `P1 ${i}` } },
                  offersV2: {
                    listings: [{ price: { money: { amount: 1, currency: 'GBP' } } }],
                  },
                })),
              },
            };
          }
          return {
            searchResult: {
              items: [
                {
                  asin: 'B0P2',
                  itemInfo: { title: { displayValue: 'P2' } },
                  offersV2: {
                    listings: [{ price: { money: { amount: 2, currency: 'GBP' } } }],
                  },
                },
              ],
            },
          };
        },
      },
    );
    assert.deepEqual(pages, [1, 1, 2]);
    assert.ok(slept.includes(2000), '429 back-off 2s');
    assert.ok(slept.includes(1100), '1.1s between pages');
  });

  it('getItems body is asinList + marketplace + resources for unpriced items', async () => {
    let getBody;
    await searchAmazonCreators(
      { q: 'x', userId: 'U', env: 'sandbox' },
      {
        env: envUsLeftovers,
        sleep: async () => {},
        httpRequest: async (req) => {
          if (String(req.url).includes('/auth/o2/token')) {
            return { access_token: 'FAKE_MINTED', expires_in: 3600 };
          }
          if (String(req.url).includes('/getItems')) {
            getBody = JSON.parse(req.body);
            return {
              getItemsResult: {
                items: [
                  {
                    asin: 'B0NOPRICE',
                    offersV2: {
                      listings: [
                        { price: { money: { amount: 9, currency: 'GBP' } } },
                      ],
                    },
                  },
                ],
              },
            };
          }
          return {
            searchResult: {
              items: [
                {
                  asin: 'B0NOPRICE',
                  itemInfo: { title: { displayValue: 'Need price' } },
                },
              ],
            },
          };
        },
      },
    );
    assert.ok(getBody);
    assert.deepEqual(getBody.asinList, ['B0NOPRICE']);
    assert.ok(getBody.asinList.length <= 10);
    assert.equal(getBody.partnerTag, 'tag-20');
    assert.equal(getBody.marketplace, 'www.amazon.co.uk');
    assert.ok(Array.isArray(getBody.resources));
  });

  it('fill-madeira uses /madeira/aws-region, skips creators-credential, treats CHANGE_ME as missing', () => {
    assert.equal(
      MADEIRA_ENV_PARAMS.amazon.some((r) => r[1] === 'AMAZON_CREATORS_CREDENTIAL'),
      false,
    );
    assert.equal(isMadeiraPlaceholder('CHANGE_ME'), true);
    assert.equal(isMadeiraPlaceholder('FAKE_AK'), false);
    const seen = [];
    const region = resolveMadeiraSsmRegion({
      getParameter: (name) => {
        seen.push(name);
        if (name === '/madeira/aws-region') return 'eu-west-1';
        return '';
      },
      env: { AWS_REGION: 'eu-west-2' },
    });
    assert.equal(region, 'eu-west-1');
    assert.ok(seen.includes('/madeira/aws-region'));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4816-fill-'));
    const { written, disabled } = fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => {
        if (name === '/madeira/amazon/access-key') return 'CHANGE_ME';
        if (name === '/madeira/amazon/secret-key') return 'FAKE_SK';
        if (name === '/madeira/amazon/associate-tag') return 'FAKE_TAG';
        if (name === '/madeira/amazon/host') return 'webservices.amazon.co.uk';
        if (name === '/madeira/amazon/region') return 'eu-west-1';
        return '';
      },
      enabledSourceIds: ['amazon'],
    });
    assert.equal(written.length, 0);
    assert.equal(disabled[0].id, 'amazon');
    assert.ok(disabled[0].missingKeys.includes('/madeira/amazon/access-key'));
  });

  it('403 AssociateNotEligible: worker throws no IN; SQS acks unavailable (FR #5220)', async () => {
    const puts = [];
    await assert.rejects(
      () =>
        run(
          {
            searchId: 's1',
            userId: 'U',
            env: 'sandbox',
            source: 'amazon',
            q: 'x',
            catalogId: 1,
          },
          {
            env: { ...envUsLeftovers, A_SEARCH_ENV: 'sandbox', S3_RESULTS_BUCKET: 'b' },
            sleep: async () => {},
            searchAmazonCreators: async () => {
              const err = new Error(
                'Amazon Creators HTTP 403: AssociateNotEligible',
              );
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

    const intakes = [];
    const err = new Error('Amazon Creators HTTP 403');
    err.status = 403;
    err.code = 'creators_not_eligible';
    err.nonRetryable = true;
    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 's1',
              env: 'sandbox',
              userId: 'U1',
            }),
            receiptHandle: 'rh-1',
          },
        ],
      },
      run: async () => {
        throw err;
      },
      deps: { putObject: async () => ({}) },
      reportException: async () => {
        intakes.push(1);
      },
      route: 'providers/live/amazon/handler',
      source: 'amazon',
    });
    assert.equal(out.results[0].skipped, 'provider_unavailable');
    assert.equal(intakes.length, 0);
  });

  it('cleanCreatorsKeywords collapses stars and spaces like madeira', () => {
    assert.equal(cleanCreatorsKeywords('servo*kit'), 'servo kit');
    assert.equal(cleanCreatorsKeywords('  a   b  '), 'a b');
  });
});

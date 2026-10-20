'use strict';

/**
 * FR #4721: Creators API mints LwA token from AMAZON_ACCESS_KEY + AMAZON_SECRET_KEY
 * and POSTs creatorsapi.amazon/catalog/v1/searchItems (not a static bearer).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchAmazonCreators,
  assertCreatorsCreds,
  AmazonCreatorsCredsError,
  buildCreatorsSearchRequest,
  normalizeCreatorsResponse,
  clearCreatorsTokenCache,
  resolveCreatorsTokenUrl,
} = require('../providers/live/amazon/src/creatorsSearch');

const baseMsg = {
  searchId: 'srch_4721',
  userId: 'U-4721',
  env: 'sandbox',
  source: 'amazon',
  q: 'servo',
};

const env = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
  AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.co.uk',
  AMAZON_REGION: 'eu-west-1',
  AMAZON_SEARCH_API: 'creators',
};

beforeEach(() => {
  clearCreatorsTokenCache();
});

describe('FR #4721 Amazon Creators LwA + searchItems', () => {
  it('assertCreatorsCreds accepts access+secret+partnerTag without AMAZON_CREATORS_CREDENTIAL', () => {
    assert.doesNotThrow(() => assertCreatorsCreds(env));
    assert.throws(
      () =>
        assertCreatorsCreds({
          AMAZON_PARTNER_TAG: 'tag-20',
          AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
        }),
      (err) => err instanceof AmazonCreatorsCredsError,
    );
  });

  it('resolveCreatorsTokenUrl uses EU endpoint for UK/eu-west-1', () => {
    assert.match(resolveCreatorsTokenUrl(env), /api\.amazon\.co\.uk\/auth\/o2\/token/);
  });

  it('searchAmazonCreators mints token then calls searchItems', async () => {
    const calls = [];
    const products = await searchAmazonCreators(baseMsg, {
      env,
      httpRequest: async (req) => {
        calls.push(req);
        if (String(req.url).includes('/auth/o2/token')) {
          const body = JSON.parse(req.body);
          assert.equal(body.grant_type, 'client_credentials');
          assert.equal(body.client_id, 'FAKE_CLIENT_ID');
          assert.equal(body.client_secret, 'FAKE_CLIENT_SECRET');
          assert.equal(body.scope, 'creatorsapi::default');
          return {
            access_token: 'FAKE_ACCESS_TOKEN',
            token_type: 'bearer',
            expires_in: 3600,
          };
        }
        assert.match(req.url, /creatorsapi\.amazon\/catalog\/v1\/searchItems/);
        assert.equal(req.headers['x-marketplace'], 'www.amazon.co.uk');
        assert.match(String(req.headers.authorization), /^Bearer FAKE_ACCESS_TOKEN$/);
        const body = JSON.parse(req.body);
        assert.equal(body.keywords, 'servo');
        assert.equal(body.partnerTag, 'tag-20');
        assert.equal(body.marketplace, 'www.amazon.co.uk');
        return {
          searchResult: {
            items: [
              {
                asin: 'B0TESTASIN',
                detailPageURL: 'https://www.amazon.co.uk/dp/B0TESTASIN',
                itemInfo: { title: { displayValue: 'Test Servo' } },
                images: {
                  primary: { small: { url: 'https://example.test/i.jpg' } },
                },
                offersV2: {
                  listings: [{ price: { money: { amount: 12.5, currency: 'GBP' } } }],
                },
              },
            ],
          },
        };
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'B0TESTASIN');
    assert.equal(products[0].title, 'Test Servo');
    assert.equal(products[0].price, 12.5);
    assert.equal(products[0].currency, 'GBP');
  });

  it('reuses cached token on second search (warm Lambda)', async () => {
    let tokenCalls = 0;
    const httpRequest = async (req) => {
      if (String(req.url).includes('/auth/o2/token')) {
        tokenCalls += 1;
        return {
          access_token: 'FAKE_CACHED',
          expires_in: 3600,
        };
      }
      return { searchResult: { items: [] } };
    };
    await searchAmazonCreators(baseMsg, { env, httpRequest });
    await searchAmazonCreators(baseMsg, { env, httpRequest });
    assert.equal(tokenCalls, 1);
  });

  it('buildCreatorsSearchRequest targets searchItems + marketplace domain', () => {
    const creds = assertCreatorsCreds(env);
    const req = buildCreatorsSearchRequest(baseMsg, {
      ...creds,
      accessToken: 'FAKE_TOK',
    });
    assert.match(req.url, /\/catalog\/v1\/searchItems$/);
    assert.equal(req.headers['x-marketplace'], 'www.amazon.co.uk');
    const body = JSON.parse(req.body);
    assert.equal(body.marketplace, 'www.amazon.co.uk');
  });

  it('normalizeCreatorsResponse reads searchResult.items nested shape', () => {
    const products = normalizeCreatorsResponse(
      {
        searchResult: {
          items: [
            {
              asin: 'B0X',
              detailPageURL: 'https://www.amazon.co.uk/dp/B0X',
              itemInfo: { title: { displayValue: 'Nested' } },
            },
          ],
        },
      },
      {
        userId: 'U1',
        env: 'sandbox',
        envVars: { AMAZON_PARTNER_TAG: 'tag-20' },
      },
    );
    assert.equal(products[0].id, 'B0X');
    assert.equal(products[0].title, 'Nested');
    assert.match(String(products[0].url), /tag=tag-20|tag-20/);
  });
});

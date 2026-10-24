'use strict';

/**
 * MRB #4809 hostile pins for FR #4807 madeira Creators parity (not product fixes).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchAmazonCreators,
  buildCreatorsGetItemsRequest,
  resolveGetItemsEndpoint,
  pickPrice,
  moneyFields,
  clearCreatorsTokenCache,
} = require('../providers/live/amazon/src/creatorsSearch');

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

describe('MRB #4809 hostile FR #4807', () => {
  it('resolveGetItemsEndpoint rewrites searchItems URL to getItems', () => {
    assert.equal(
      resolveGetItemsEndpoint(
        'https://creatorsapi.amazon/catalog/v1/searchItems',
      ),
      'https://creatorsapi.amazon/catalog/v1/getItems',
    );
  });

  it('moneyFields ignores empty displayAmount / amount (no NaN price)', () => {
    assert.deepEqual(moneyFields({ displayAmount: 'GBP', currency: 'GBP' }), {
      price: undefined,
      currency: 'GBP',
    });
    assert.equal(pickPrice({ offersV2: { listings: [{ price: { money: {} } }] } }).price, undefined);
  });

  it('buildCreatorsGetItemsRequest uses asinList and medium image resource', () => {
    const req = buildCreatorsGetItemsRequest(['B01', 'B02'], {
      partnerTag: 'tag-20',
      marketplace: 'www.amazon.co.uk',
      accessToken: 'FAKE_TOK',
      endpoint: 'https://creatorsapi.amazon/catalog/v1/searchItems',
    });
    assert.match(String(req.url), /\/getItems$/);
    const body = JSON.parse(req.body);
    assert.deepEqual(body.asinList, ['B01', 'B02']);
    assert.ok(body.resources.includes('images.primary.medium'));
  });

  it('searchAmazonCreators does not call getItems when searchItems already priced', async () => {
    const calls = [];
    const products = await searchAmazonCreators(
      { searchId: 's', userId: 'U', env: 'sandbox', q: 'x' },
      {
        env,
        httpRequest: async (req) => {
          calls.push(req);
          if (String(req.url).includes('/auth/o2/token')) {
            return { access_token: 'FAKE_ACCESS_TOKEN', expires_in: 3600 };
          }
          assert.match(String(req.url), /\/searchItems$/);
          return {
            searchResult: {
              items: [
                {
                  asin: 'B0PRICED',
                  detailPageURL: 'https://www.amazon.co.uk/dp/B0PRICED',
                  itemInfo: { title: { displayValue: 'Priced' } },
                  offersV2: {
                    listings: [
                      {
                        price: {
                          money: { amount: 10, currency: 'GBP' },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          };
        },
      },
    );
    assert.equal(products[0].price, 10);
    assert.ok(!calls.some((c) => String(c.url).includes('/getItems')));
  });

  it('getItems HTTP failure still returns searchItems rows (madeira continue)', async () => {
    const products = await searchAmazonCreators(
      { searchId: 's', userId: 'U', env: 'sandbox', q: 'x' },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url).includes('/auth/o2/token')) {
            return { access_token: 'FAKE_ACCESS_TOKEN', expires_in: 3600 };
          }
          if (String(req.url).includes('/getItems')) {
            throw Object.assign(new Error('boom'), { status: 500 });
          }
          return {
            searchResult: {
              items: [
                {
                  asin: 'B0SOFT',
                  detailPageURL: 'https://www.amazon.co.uk/dp/B0SOFT',
                  itemInfo: { title: { displayValue: 'Soft fail getItems' } },
                },
              ],
            },
          };
        },
      },
    );
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'B0SOFT');
    assert.equal(products[0].price, undefined);
  });
});

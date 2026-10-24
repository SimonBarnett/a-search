'use strict';

/**
 * FR #4807: Amazon Creators client must match madeira-sqs-affiliate/routes/paapi.js
 * parity that worked with the provided LwA credentials:
 * - build detail URL from ASIN when Creators omits detailPageURL
 * - parse offersV2 price.money.displayAmount when amount is absent
 * - force missing prices via GetItems (hybrid searchItems + getItems)
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchAmazonCreators,
  normalizeCreatorsResponse,
  buildCreatorsSearchRequest,
  clearCreatorsTokenCache,
  pickPrice,
  detailUrlForAsin,
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

const baseMsg = {
  searchId: 'srch_4807',
  userId: 'U-4807',
  env: 'sandbox',
  source: 'amazon',
  q: 'headphones',
};

beforeEach(() => {
  clearCreatorsTokenCache();
});

describe('FR #4807 Amazon Creators madeira paapi.js parity', () => {
  it('pickPrice reads displayAmount when amount is missing', () => {
    const { price, currency } = pickPrice({
      offersV2: {
        listings: [
          {
            price: {
              money: { displayAmount: '£29.99', currency: 'GBP' },
            },
          },
        ],
      },
    });
    assert.equal(price, 29.99);
    assert.equal(currency, 'GBP');
  });

  it('detailUrlForAsin builds marketplace /dp/ASIN URL', () => {
    assert.equal(
      detailUrlForAsin('B0TESTASIN', 'www.amazon.co.uk'),
      'https://www.amazon.co.uk/dp/B0TESTASIN',
    );
  });

  it('normalizeCreatorsResponse stamps tracked URL from ASIN when detailPageURL absent', () => {
    const products = normalizeCreatorsResponse(
      {
        searchResult: {
          items: [
            {
              asin: 'B0NOURL',
              itemInfo: { title: { displayValue: 'No Detail URL' } },
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
    assert.equal(products[0].id, 'B0NOURL');
    assert.match(String(products[0].url), /amazon\.co\.uk\/dp\/B0NOURL/);
    assert.match(String(products[0].url), /tag=tag-20|tag-20/);
  });

  it('buildCreatorsSearchRequest asks for medium image like madeira paapi.js', () => {
    const req = buildCreatorsSearchRequest(baseMsg, {
      partnerTag: 'tag-20',
      marketplace: 'www.amazon.co.uk',
      endpoint: 'https://creatorsapi.amazon/catalog/v1/searchItems',
      accessToken: 'FAKE_TOK',
    });
    const body = JSON.parse(req.body);
    assert.ok(body.resources.includes('images.primary.medium'));
    assert.ok(body.resources.includes('offersV2.listings.price'));
  });

  it('searchAmazonCreators calls getItems for items missing price (madeira hybrid)', async () => {
    const calls = [];
    const products = await searchAmazonCreators(baseMsg, {
      env,
      httpRequest: async (req) => {
        calls.push(req);
        if (String(req.url).includes('/auth/o2/token')) {
          return {
            access_token: 'FAKE_ACCESS_TOKEN',
            expires_in: 3600,
          };
        }
        if (String(req.url).includes('/getItems')) {
          const body = JSON.parse(req.body);
          assert.ok(
            Array.isArray(body.asinList) || Array.isArray(body.itemIds),
            'getItems body needs asinList or itemIds',
          );
          const asins = body.asinList || body.itemIds;
          assert.deepEqual(asins, ['B0NOPRICE']);
          return {
            getItemsResult: {
              items: [
                {
                  asin: 'B0NOPRICE',
                  offersV2: {
                    listings: [
                      {
                        price: {
                          money: {
                            amount: 19.5,
                            currency: 'GBP',
                            displayAmount: '£19.50',
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          };
        }
        assert.match(String(req.url), /\/searchItems$/);
        return {
          searchResult: {
            items: [
              {
                asin: 'B0NOPRICE',
                detailPageURL: 'https://www.amazon.co.uk/dp/B0NOPRICE',
                itemInfo: { title: { displayValue: 'Needs GetItems Price' } },
                images: {
                  primary: {
                    medium: { url: 'https://example.test/m.jpg' },
                  },
                },
                // no offersV2 — madeira forces price via GetItems
              },
            ],
          },
        };
      },
    });

    assert.ok(
      calls.some((c) => String(c.url).includes('/getItems')),
      'expected getItems after searchItems for price-less ASINs',
    );
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'B0NOPRICE');
    assert.equal(products[0].price, 19.5);
    assert.equal(products[0].currency, 'GBP');
    assert.equal(products[0].imageUrl, 'https://example.test/m.jpg');
  });
});

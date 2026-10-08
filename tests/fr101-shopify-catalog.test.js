'use strict';

/**
 * FR-101 / #654: shopify Admin/REST catalogue client + fixtures (stay dark).
 * No live network; injectable httpRequest + recorded products-ok.json.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const fixturePath = path.join(
  root,
  'providers',
  'local',
  'shopify',
  'fixtures',
  'products-ok.json',
);
const {
  fetchCatalogPage,
  ShopifyCredsError,
  buildProductsUrl,
  shopHostFromStoreUrl,
} = require('../providers/local/shopify/src/catalog.js');
const { loadRegistry } = require('../providers/loadRegistry');

const credEnv = {
  SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
  SHOPIFY_ACCESS_TOKEN: 'shpat_test_fixture_only',
  SHOPIFY_API_VERSION: '2024-10',
};

describe('FR-101 shopify Admin/REST catalogue client (stay dark)', () => {
  it('fixture HTTP → normalize products (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await fetchCatalogPage({
      env: credEnv,
      envName: 'sandbox',
      feedKey: 'madeira-demo',
      limit: 50,
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(
          req.url,
          /madeira-demo\.myshopify\.com\/admin\/api\/2024-10\/products\.json/,
        );
        assert.equal(
          req.headers['X-Shopify-Access-Token'],
          'shpat_test_fixture_only',
        );
        assert.equal(req.headers.Accept, 'application/json');
        return { statusCode: 200, headers: {}, body: fixture };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'shopify');
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].MerchantProductId, '801001');
    assert.equal(out.products[0].Title, 'Madeira Sun Hat');
    assert.equal(out.products[0].Price, 24.5);
    assert.equal(out.products[0].Currency, 'GBP');
    assert.equal(out.products[0].Source, 'shopify');
    assert.equal(out.products[0].Env, 'sandbox');
    assert.equal(out.products[0].FeedKey, 'madeira-demo');
    assert.equal(out.products[0].Url, '/products/madeira-sun-hat');
    assert.equal(out.products[1].MerchantProductId, '801002');
    assert.equal(out.products[1].Title, 'Levada Trail Bottle');
    assert.equal(out.products[1].Currency, 'EUR');
    assert.equal(httpCalls.length, 1);
  });

  it('missing access token → clear shopify_missing_credentials error', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: { SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com' },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof ShopifyCredsError ||
            err.code === 'shopify_missing_credentials',
        );
        assert.match(
          String(err.message),
          /SHOPIFY_ACCESS_TOKEN|credentials missing/i,
        );
        return true;
      },
    );
  });

  it('missing store URL → clear credentials error', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: { SHOPIFY_ACCESS_TOKEN: 'tok' },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof ShopifyCredsError ||
            err.code === 'shopify_missing_credentials',
        );
        assert.match(String(err.message), /SHOPIFY_STORE_URL/i);
        return true;
      },
    );
  });

  it('registry shopify stays dark (enabled live/sandbox false)', () => {
    const { sources } = loadRegistry();
    const s = sources.find((x) => x.id === 'shopify');
    assert.ok(s, 'shopify in registry');
    assert.equal(s.kind, 'local');
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('buildProductsUrl + shopHostFromStoreUrl normalize host', () => {
    assert.equal(
      shopHostFromStoreUrl('madeira-demo.myshopify.com'),
      'madeira-demo.myshopify.com',
    );
    const url = buildProductsUrl('https://madeira-demo.myshopify.com', {
      apiVersion: '2024-10',
      limit: 10,
    });
    assert.match(url, /^https:\/\/madeira-demo\.myshopify\.com\/admin\/api\/2024-10\/products\.json\?/);
    assert.match(url, /limit=10/);
  });

  it('deliverables exist: catalog.js, fixture, .env.example placeholders', () => {
    const base = path.join(root, 'providers', 'local', 'shopify');
    assert.ok(fs.existsSync(path.join(base, 'src', 'catalog.js')));
    assert.ok(fs.existsSync(path.join(base, 'fixtures', 'products-ok.json')));
    const envEx = fs.readFileSync(path.join(base, '.env.example'), 'utf8');
    assert.match(envEx, /SHOPIFY_STORE_URL=/);
    assert.match(envEx, /SHOPIFY_ACCESS_TOKEN=/);
    assert.doesNotMatch(envEx, /shpat_[a-zA-Z0-9]{20,}/);
  });
});

'use strict';

/**
 * FR-109 / #662: woocommerce Admin/REST catalogue client + fixtures (stay dark).
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
  'woocommerce',
  'fixtures',
  'products-ok.json',
);
const {
  fetchCatalogPage,
  WooCommerceCredsError,
  buildProductsUrl,
  storeOriginFromUrl,
  basicAuthHeader,
} = require('../providers/local/woocommerce/src/catalog.js');
const { loadRegistry } = require('../providers/loadRegistry');

const credEnv = {
  WOOCOMMERCE_STORE_URL: 'https://madeira-demo.example.invalid',
  WOOCOMMERCE_CONSUMER_KEY: 'ck_test_fixture_only',
  WOOCOMMERCE_CONSUMER_SECRET: 'cs_test_fixture_only',
};

describe('FR-109 woocommerce REST catalogue client (stay dark)', () => {
  it('fixture HTTP -> normalize products (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await fetchCatalogPage({
      env: credEnv,
      envName: 'sandbox',
      feedKey: 'madeira-demo',
      perPage: 50,
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(
          req.url,
          /madeira-demo\.example\.invalid\/wp-json\/wc\/v3\/products\?/,
        );
        assert.match(req.url, /per_page=50/);
        assert.equal(req.headers.Accept, 'application/json');
        assert.equal(
          req.headers.Authorization,
          basicAuthHeader('ck_test_fixture_only', 'cs_test_fixture_only'),
        );
        return { statusCode: 200, headers: {}, body: fixture };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'woocommerce');
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].MerchantProductId, '801001');
    assert.equal(out.products[0].Title, 'Madeira Sun Hat');
    assert.equal(out.products[0].Price, 24.5);
    assert.equal(out.products[0].Currency, 'GBP');
    assert.equal(out.products[0].Source, 'woocommerce');
    assert.equal(out.products[0].Env, 'sandbox');
    assert.equal(out.products[0].FeedKey, 'madeira-demo');
    assert.equal(
      out.products[0].Url,
      'https://madeira-demo.example.invalid/product/madeira-sun-hat/',
    );
    assert.equal(out.products[1].MerchantProductId, '801002');
    assert.equal(out.products[1].Title, 'Levada Trail Bottle');
    assert.equal(out.products[1].Currency, 'EUR');
    assert.equal(httpCalls.length, 1);
  });

  it('missing consumer key -> clear woocommerce_missing_credentials error', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: {
            WOOCOMMERCE_STORE_URL: 'https://madeira-demo.example.invalid',
            WOOCOMMERCE_CONSUMER_SECRET: 'cs_x',
          },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof WooCommerceCredsError ||
            err.code === 'woocommerce_missing_credentials',
        );
        assert.match(
          String(err.message),
          /WOOCOMMERCE_CONSUMER_KEY|credentials missing/i,
        );
        return true;
      },
    );
  });

  it('missing store URL -> clear credentials error', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: {
            WOOCOMMERCE_CONSUMER_KEY: 'ck_x',
            WOOCOMMERCE_CONSUMER_SECRET: 'cs_x',
          },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof WooCommerceCredsError ||
            err.code === 'woocommerce_missing_credentials',
        );
        assert.match(String(err.message), /WOOCOMMERCE_STORE_URL/i);
        return true;
      },
    );
  });

  it('registry woocommerce stays dark (enabled live/sandbox false)', () => {
    const { sources } = loadRegistry();
    const s = sources.find((x) => x.id === 'woocommerce');
    assert.ok(s, 'woocommerce in registry');
    assert.equal(s.kind, 'local');
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('buildProductsUrl + storeOriginFromUrl normalize origin', () => {
    assert.equal(
      storeOriginFromUrl('madeira-demo.example.invalid'),
      'https://madeira-demo.example.invalid',
    );
    const url = buildProductsUrl('https://madeira-demo.example.invalid', {
      perPage: 10,
      page: 2,
    });
    assert.match(
      url,
      /^https:\/\/madeira-demo\.example\.invalid\/wp-json\/wc\/v3\/products\?/,
    );
    assert.match(url, /per_page=10/);
    assert.match(url, /page=2/);
  });

  it('deliverables exist: catalog.js, fixture, .env.example placeholders', () => {
    const dir = path.join(root, 'providers', 'local', 'woocommerce');
    assert.ok(fs.existsSync(path.join(dir, 'src', 'catalog.js')));
    assert.ok(fs.existsSync(path.join(dir, 'fixtures', 'products-ok.json')));
    const envEx = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
    assert.match(envEx, /WOOCOMMERCE_STORE_URL=/);
    assert.match(envEx, /WOOCOMMERCE_CONSUMER_KEY=/);
    assert.match(envEx, /WOOCOMMERCE_CONSUMER_SECRET=/);
    assert.doesNotMatch(envEx, /ck_[a-zA-Z0-9]{20,}/);
    assert.doesNotMatch(envEx, /cs_[a-zA-Z0-9]{20,}/);
  });

  it('skill documents catalogue client (FR-109)', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'woocommerce',
        '.grok',
        'skills',
        'a-search-woocommerce',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Catalogue client \(FR-109\)/);
    assert.match(skill, /catalog\.js/);
    assert.match(skill, /products-ok\.json/);
    assert.ok(!skill.includes('\ufffd'));
  });
});

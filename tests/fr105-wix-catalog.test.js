'use strict';

/**
 * FR-105 / #658: wix Admin/REST catalogue client + fixtures (stay dark).
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
  'wix',
  'fixtures',
  'products-ok.json',
);
const {
  fetchCatalogPage,
  WixCredsError,
  buildProductsQueryUrl,
  DEFAULT_API_BASE,
} = require('../providers/local/wix/src/catalog.js');
const { loadRegistry } = require('../providers/loadRegistry');

const credEnv = {
  WIX_SITE_ID: 'site-madeira-demo',
  WIX_API_TOKEN: 'wix_api_key_fixture_only',
};

describe('FR-105 wix Stores catalogue client (stay dark)', () => {
  it('fixture HTTP -> normalize products (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await fetchCatalogPage({
      env: credEnv,
      envName: 'sandbox',
      feedKey: 'madeira-demo',
      limit: 50,
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.equal(req.method, 'POST');
        assert.match(req.url, /wixapis\.com\/stores\/v1\/products\/query/);
        assert.equal(req.headers.Authorization, 'wix_api_key_fixture_only');
        assert.equal(req.headers['wix-site-id'], 'site-madeira-demo');
        assert.equal(req.headers['Content-Type'], 'application/json');
        const body = JSON.parse(req.body);
        assert.equal(body.query.paging.limit, 50);
        return { statusCode: 200, headers: {}, body: fixture };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'wix');
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].MerchantProductId, 'wix-prod-801001');
    assert.equal(out.products[0].Title, 'Madeira Sun Hat');
    assert.equal(out.products[0].Price, 24.5);
    assert.equal(out.products[0].Currency, 'GBP');
    assert.equal(out.products[0].Source, 'wix');
    assert.equal(out.products[0].Env, 'sandbox');
    assert.equal(out.products[0].FeedKey, 'madeira-demo');
    assert.match(String(out.products[0].Url), /madeira-sun-hat/);
    assert.equal(out.products[1].MerchantProductId, 'wix-prod-801002');
    assert.equal(out.products[1].Currency, 'EUR');
    assert.equal(httpCalls.length, 1);
  });

  it('missing API token -> clear wix_missing_credentials error', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: { WIX_SITE_ID: 'site-1' },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof WixCredsError || err.code === 'wix_missing_credentials',
        );
        assert.match(String(err.message), /WIX_API_TOKEN|credentials missing/i);
        return true;
      },
    );
  });

  it('missing site id -> clear credentials error', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: { WIX_API_TOKEN: 'tok' },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof WixCredsError || err.code === 'wix_missing_credentials',
        );
        assert.match(String(err.message), /WIX_SITE_ID/i);
        return true;
      },
    );
  });

  it('registry wix stays dark (enabled live/sandbox false)', () => {
    const { sources } = loadRegistry();
    const s = sources.find((x) => x.id === 'wix');
    assert.ok(s, 'wix in registry');
    assert.equal(s.kind, 'local');
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('buildProductsQueryUrl defaults to wixapis stores query', () => {
    assert.equal(
      buildProductsQueryUrl(DEFAULT_API_BASE),
      'https://www.wixapis.com/stores/v1/products/query',
    );
  });

  it('deliverables exist: catalog.js, fixture, .env.example placeholders', () => {
    const base = path.join(root, 'providers', 'local', 'wix');
    assert.ok(fs.existsSync(path.join(base, 'src', 'catalog.js')));
    assert.ok(fs.existsSync(path.join(base, 'fixtures', 'products-ok.json')));
    const envEx = fs.readFileSync(path.join(base, '.env.example'), 'utf8');
    assert.match(envEx, /WIX_SITE_ID=/);
    assert.match(envEx, /WIX_API_TOKEN=/);
  });
});

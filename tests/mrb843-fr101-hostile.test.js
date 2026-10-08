'use strict';

/**
 * MRB #843 hostile pins for FR-101 shopify Admin/REST catalogue client (stay-dark).
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
  DEFAULT_API_VERSION,
} = require('../providers/local/shopify/src/catalog.js');

describe('MRB-843 FR-101 hostile', () => {
  it('registry shopify stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'shopify');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.kind, 'local');
    assert.equal(row.queueEnv, 'SQS_SHOPIFY_URL');
  });

  it('fetchCatalogPage uses injectable httpRequest (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const calls = [];
    const out = await fetchCatalogPage({
      env: {
        SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
        SHOPIFY_ACCESS_TOKEN: 'shpat_test_fixture_only',
        SHOPIFY_API_VERSION: '2024-10',
      },
      envName: 'sandbox',
      feedKey: 'madeira-demo',
      httpRequest: async (req) => {
        calls.push(req);
        return { statusCode: 200, headers: {}, body: fixture };
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'shopify');
    assert.ok(out.products.length >= 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['X-Shopify-Access-Token'], 'shpat_test_fixture_only');
    assert.match(calls[0].url, /\/admin\/api\/2024-10\/products\.json/);
  });

  it('missing token throws ShopifyCredsError', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: {
            SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
            SHOPIFY_ACCESS_TOKEN: '',
          },
          httpRequest: async () => {
            throw new Error('should not call http');
          },
        }),
      (err) => {
        assert.ok(err instanceof ShopifyCredsError);
        assert.match(String(err.code || err.message), /missing|credential/i);
        return true;
      },
    );
  });

  it('URL helpers normalize myshopify host; default API version pinned', () => {
    assert.equal(
      shopHostFromStoreUrl('https://madeira-demo.myshopify.com/'),
      'madeira-demo.myshopify.com',
    );
    assert.match(
      buildProductsUrl('madeira-demo.myshopify.com', DEFAULT_API_VERSION, 50),
      /products\.json/,
    );
    assert.equal(DEFAULT_API_VERSION, '2024-10');
  });

  it('worker remains stub; catalog is separate (FR-101 out of scope)', () => {
    const worker = fs.readFileSync(
      path.join(root, 'providers', 'local', 'shopify', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(worker, /fetchCatalogPage|catalog\.js/);
    assert.match(worker, /module\.exports\s*=\s*\{\s*run\s*\}/);
  });

  it('skill documents FR-101 catalogue; .env.example secrets empty; ASCII', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'shopify',
        '.grok',
        'skills',
        'a-search-shopify',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Catalogue client \(FR-101\)/);
    assert.match(skill, /catalog\.js/);
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'shopify', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^SHOPIFY_STORE_URL=\s*$/m);
    assert.match(envEx, /^SHOPIFY_ACCESS_TOKEN=\s*$/m);
    assert.doesNotMatch(envEx, /SHOPIFY_ACCESS_TOKEN=\S+/);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(envEx));
  });
});

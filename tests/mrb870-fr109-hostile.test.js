'use strict';

/**
 * MRB #870 hostile pins for FR-109 woocommerce REST catalogue client (stay-dark).
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
  DEFAULT_API_PREFIX,
} = require('../providers/local/woocommerce/src/catalog.js');

describe('MRB-870 FR-109 hostile', () => {
  it('registry woocommerce stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'woocommerce');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.kind, 'local');
    assert.equal(row.queueEnv, 'SQS_WOOCOMMERCE_URL');
  });

  it('fetchCatalogPage uses injectable httpRequest + Basic auth (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const calls = [];
    const out = await fetchCatalogPage({
      env: {
        WOOCOMMERCE_STORE_URL: 'https://madeira-demo.example.invalid',
        WOOCOMMERCE_CONSUMER_KEY: 'ck_hostile',
        WOOCOMMERCE_CONSUMER_SECRET: 'cs_hostile',
      },
      envName: 'sandbox',
      feedKey: 'madeira-demo',
      httpRequest: async (req) => {
        calls.push(req);
        return { statusCode: 200, headers: {}, body: fixture };
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'woocommerce');
    assert.ok(out.products.length >= 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(
      calls[0].headers.Authorization,
      basicAuthHeader('ck_hostile', 'cs_hostile'),
    );
    assert.match(
      String(calls[0].url || ''),
      /wp-json\/wc\/v3\/products/,
    );
    assert.match(String(calls[0].url || ''), /example\.invalid/);
  });

  it('missing consumer secret throws WooCommerceCredsError', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: {
            WOOCOMMERCE_STORE_URL: 'https://madeira-demo.example.invalid',
            WOOCOMMERCE_CONSUMER_KEY: 'ck_x',
            WOOCOMMERCE_CONSUMER_SECRET: '',
          },
          httpRequest: async () => {
            throw new Error('should not call http');
          },
        }),
      (err) => {
        assert.ok(err instanceof WooCommerceCredsError);
        assert.match(String(err.code || err.message), /missing|credential/i);
        return true;
      },
    );
  });

  it('URL helpers pin default API prefix + products path', () => {
    assert.equal(DEFAULT_API_PREFIX, '/wp-json/wc/v3');
    assert.equal(
      storeOriginFromUrl('madeira-demo.example.invalid'),
      'https://madeira-demo.example.invalid',
    );
    assert.match(
      buildProductsUrl('https://madeira-demo.example.invalid', { perPage: 5 }),
      /\/wp-json\/wc\/v3\/products\?/,
    );
  });

  it('worker does not import catalogue client (FR-109 stays separate from worker FR)', () => {
    const worker = fs.readFileSync(
      path.join(root, 'providers', 'local', 'woocommerce', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(worker, /fetchCatalogPage|catalog\.js/);
  });

  it('skill documents FR-109 catalogue; .env.example secrets empty; ASCII', () => {
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
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'woocommerce', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^WOOCOMMERCE_STORE_URL=\s*$/m);
    assert.match(envEx, /^WOOCOMMERCE_CONSUMER_KEY=\s*$/m);
    assert.match(envEx, /^WOOCOMMERCE_CONSUMER_SECRET=\s*$/m);
    assert.doesNotMatch(envEx, /WOOCOMMERCE_CONSUMER_KEY=\S+/);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(envEx));
    const fixture = fs.readFileSync(fixturePath, 'utf8');
    assert.match(fixture, /example\.invalid/);
  });
});

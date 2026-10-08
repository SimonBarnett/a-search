'use strict';

/**
 * MRB #854 hostile pins for FR-105 wix Stores catalogue client (stay-dark).
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
  DEFAULT_QUERY_PATH,
} = require('../providers/local/wix/src/catalog.js');

describe('MRB-854 FR-105 hostile', () => {
  it('registry wix stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'wix');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.kind, 'local');
    assert.equal(row.queueEnv, 'SQS_WIX_URL');
  });

  it('fetchCatalogPage uses injectable httpRequest (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const calls = [];
    const out = await fetchCatalogPage({
      env: {
        WIX_SITE_ID: 'site-hostile',
        WIX_API_TOKEN: 'tok-hostile',
      },
      envName: 'sandbox',
      feedKey: 'madeira-demo',
      httpRequest: async (req) => {
        calls.push(req);
        return { statusCode: 200, headers: {}, body: fixture };
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'wix');
    assert.ok(out.products.length >= 2);
    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].headers.Authorization === 'tok-hostile' ||
        String(calls[0].headers.Authorization || '').includes('tok-hostile'),
    );
    assert.equal(calls[0].headers['wix-site-id'], 'site-hostile');
    assert.match(String(calls[0].url || calls[0].path || ''), /products\/query|stores/);
  });

  it('missing token throws WixCredsError', async () => {
    await assert.rejects(
      () =>
        fetchCatalogPage({
          env: {
            WIX_SITE_ID: 'site-hostile',
            WIX_API_TOKEN: '',
          },
          httpRequest: async () => {
            throw new Error('should not call http');
          },
        }),
      (err) => {
        assert.ok(err instanceof WixCredsError);
        assert.match(String(err.code || err.message), /missing|credential/i);
        return true;
      },
    );
  });

  it('URL helpers pin default API base + query path', () => {
    assert.match(DEFAULT_API_BASE, /wixapis\.com/);
    assert.match(DEFAULT_QUERY_PATH, /products\/query/);
    assert.match(buildProductsQueryUrl(DEFAULT_API_BASE), /products\/query/);
  });

  it('worker remains stub; catalog is separate (FR-105 out of scope)', () => {
    const worker = fs.readFileSync(
      path.join(root, 'providers', 'local', 'wix', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(worker, /fetchCatalogPage|catalog\.js/);
    assert.match(worker, /module\.exports\s*=\s*\{\s*run\s*\}/);
  });

  it('skill documents FR-105 catalogue; .env.example secrets empty; ASCII', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'wix',
        '.grok',
        'skills',
        'a-search-wix',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Catalogue client \(FR-105\)/);
    assert.match(skill, /catalog\.js/);
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'wix', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^WIX_SITE_ID=\s*$/m);
    assert.match(envEx, /^WIX_API_TOKEN=\s*$/m);
    assert.doesNotMatch(envEx, /WIX_API_TOKEN=\S+/);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(envEx));
    const fixture = fs.readFileSync(fixturePath, 'utf8');
    assert.match(fixture, /example\.invalid/);
  });
});

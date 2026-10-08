'use strict';

/**
 * MRB #852 hostile pins for FR-104 shopify selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeShopifySelftest,
  shopifySelftestProbe,
} = require('../providers/local/shopify/src/selftestProbe');

describe('MRB-852 FR-104 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('shopify'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'shopify');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeShopifySelftest({
      env: {
        MSSQL_SERVER: 's',
        MSSQL_DATABASE: 'd',
        MSSQL_USER: 'u',
        MSSQL_PASSWORD: 'p',
      },
      connect: async () => ({
        request() {
          return {
            async query() {
              return { recordset: [{ ok: 1 }] };
            },
          };
        },
        async close() {},
      }),
      now: (() => {
        let t = 1000;
        return () => {
          t += 5;
          return t;
        };
      })(),
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.source, 'shopify');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await shopifySelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('ACCESS_TOKEN feed-ready path without MSSQL', async () => {
    const out = await probeShopifySelftest({
      env: { SHOPIFY_ACCESS_TOKEN: 'shpat_test' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'shopify');
  });

  it('missing MSSQL and empty token -> ok false', async () => {
    const out = await probeShopifySelftest({
      env: {
        MSSQL_SERVER: '',
        MSSQL_DATABASE: '',
        SHOPIFY_ACCESS_TOKEN: '',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, false);
    assert.equal(out.source, 'shopify');
    assert.ok(out.error);
  });

  it('skill Selftest + pacing + prior FR-101/102/103 keep-both', () => {
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
    assert.match(skill, /## Selftest \+ pacing \(FR-104\)/);
    assert.match(skill, /## Catalogue client \(FR-101\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-102\)/);
    assert.match(skill, /## Worker \+ queryParts \(FR-103\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
  });

  it('fr058b no-rateLimit example retargeted off shopify/wix to woocommerce', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
    assert.ok(!/assert\.equal\(rateLimit\('shopify'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('wix'\),\s*undefined\)/.test(src));
    assert.deepEqual(rateLimit('shopify'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.deepEqual(rateLimit('wix'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.deepEqual(rateLimit('woocommerce'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.equal(rateLimit('__no_such_source__'), undefined);
  });
});

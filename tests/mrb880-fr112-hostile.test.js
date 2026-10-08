'use strict';

/**
 * MRB #880 hostile pins for FR-112 woocommerce selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeWooCommerceSelftest,
  woocommerceSelftestProbe,
} = require('../providers/local/woocommerce/src/selftestProbe');

describe('MRB-880 FR-112 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('woocommerce'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'woocommerce');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeWooCommerceSelftest({
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
    assert.equal(ok.source, 'woocommerce');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await woocommerceSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('WOOCOMMERCE_CONSUMER_KEY feed-ready path without MSSQL', async () => {
    const out = await probeWooCommerceSelftest({
      env: { WOOCOMMERCE_CONSUMER_KEY: 'ck_test' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'woocommerce');
  });

  it('missing MSSQL and empty key -> ok false', async () => {
    const out = await probeWooCommerceSelftest({
      env: {
        MSSQL_SERVER: '',
        MSSQL_DATABASE: '',
        WOOCOMMERCE_CONSUMER_KEY: '',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, false);
    assert.equal(out.source, 'woocommerce');
    assert.ok(out.error);
  });

  it('skill Selftest + pacing + prior FR-109/110/111 keep-both', () => {
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
    assert.match(skill, /## Selftest \+ pacing \(FR-112\)/);
    assert.match(skill, /## Catalogue client \(FR-109\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-110\)/);
    assert.match(skill, /## Worker \+ queryParts \(FR-111\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
  });

  it('fr058b no-rateLimit example retargeted off woocommerce to __no_such_source__', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
    assert.ok(
      !/assert\.equal\(rateLimit\('woocommerce'\),\s*undefined\)/.test(src),
    );
    assert.deepEqual(rateLimit('woocommerce'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.equal(rateLimit('__no_such_source__'), undefined);
  });
});

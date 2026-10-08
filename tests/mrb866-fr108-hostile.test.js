'use strict';

/**
 * MRB #866 hostile pins for FR-108 wix selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeWixSelftest,
  wixSelftestProbe,
} = require('../providers/local/wix/src/selftestProbe');

describe('MRB-866 FR-108 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('wix'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'wix');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeWixSelftest({
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
    assert.equal(ok.source, 'wix');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await wixSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('WIX_API_TOKEN feed-ready path without MSSQL', async () => {
    const out = await probeWixSelftest({
      env: { WIX_API_TOKEN: 'tok-test' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'wix');
  });

  it('missing MSSQL and empty token -> ok false', async () => {
    const out = await probeWixSelftest({
      env: {
        MSSQL_SERVER: '',
        MSSQL_DATABASE: '',
        WIX_API_TOKEN: '',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, false);
    assert.equal(out.source, 'wix');
    assert.ok(out.error);
  });

  it('skill Selftest + pacing + prior FR-105/106/107 keep-both', () => {
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
    assert.match(skill, /## Selftest \+ pacing \(FR-108\)/);
    assert.match(skill, /## Catalogue client \(FR-105\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-106\)/);
    assert.match(skill, /## Worker \+ queryParts \(FR-107\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
  });

  it('fr058b no-rateLimit example retargeted off wix to woocommerce', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('woocommerce'\)/);
    assert.ok(!/assert\.equal\(rateLimit\('wix'\),\s*undefined\)/.test(src));
    assert.deepEqual(rateLimit('wix'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.equal(rateLimit('woocommerce'), undefined);
  });
});

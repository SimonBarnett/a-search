'use strict';

/**
 * MRB #830 hostile pins for FR-099 avantlink selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeAvantlinkSelftest,
  avantlinkSelftestProbe,
} = require('../providers/local/avantlink/src/selftestProbe');

describe('MRB-830 FR-099 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('avantlink'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'avantlink');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeAvantlinkSelftest({
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
    assert.equal(ok.source, 'avantlink');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await avantlinkSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('token feed-ready path without MSSQL', async () => {
    const out = await probeAvantlinkSelftest({
      env: { AVANTLINK_API_TOKEN: 'tok-test' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'avantlink');
  });

  it('missing MSSQL and empty token -> ok false (fixture_invalid class)', async () => {
    const out = await probeAvantlinkSelftest({
      env: {
        MSSQL_SERVER: '',
        MSSQL_DATABASE: '',
        AVANTLINK_API_TOKEN: '',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, false);
    assert.equal(out.source, 'avantlink');
    assert.ok(out.error);
  });

  it('skill Selftest + pacing + FR-098 Search path both present', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'avantlink',
        '.grok',
        'skills',
        'a-search-avantlink',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Selftest \+ pacing \(FR-099\)/);
    assert.match(skill, /## Search path \(FR-098\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
  });

  it('fr058b no-rateLimit example retargeted off avantlink/shopify/wix to woocommerce', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
    assert.ok(!/assert\.equal\(rateLimit\('avantlink'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('shopify'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('wix'\),\s*undefined\)/.test(src));
    assert.deepEqual(rateLimit('avantlink'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
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

  it('.env.example AFFILIATE_ID and API_TOKEN empty', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'avantlink', '.env.example'),
      'utf8',
    );
    for (const key of [
      'AVANTLINK_AFFILIATE_ID=',
      'AVANTLINK_API_TOKEN=',
      'MSSQL_PASSWORD=',
    ]) {
      const line = envEx.split(/\r?\n/).find((l) => l.startsWith(key));
      assert.equal(line, key);
    }
  });
});

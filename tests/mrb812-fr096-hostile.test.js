'use strict';

/**
 * MRB #812 hostile pins for FR-096 flexoffers selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeFlexoffersSelftest,
  flexoffersSelftestProbe,
} = require('../providers/local/flexoffers/src/selftestProbe');

describe('MRB-812 FR-096 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('flexoffers'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'flexoffers');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeFlexoffersSelftest({
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
    assert.equal(ok.source, 'flexoffers');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await flexoffersSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('token feed-ready path without MSSQL', async () => {
    const out = await probeFlexoffersSelftest({
      env: { FLEXOFFERS_API_TOKEN: 'tok-test' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'flexoffers');
  });

  it('missing MSSQL and empty token -> ok false (fixture_invalid class)', async () => {
    const out = await probeFlexoffersSelftest({
      env: {
        MSSQL_SERVER: '',
        MSSQL_DATABASE: '',
        FLEXOFFERS_API_TOKEN: '',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, false);
    assert.equal(out.source, 'flexoffers');
    assert.ok(out.error);
  });

  it('skill Selftest + pacing + FR-095 Search path both present', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'flexoffers',
        '.grok',
        'skills',
        'a-search-flexoffers',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Selftest \+ pacing \(FR-096\)/);
    assert.match(skill, /## Search path \(FR-095\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
  });

  it('fr058b no-rateLimit example retargeted off flexoffers', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('avantlink'\)/);
    assert.ok(!/assert\.equal\(rateLimit\('flexoffers'\),\s*undefined\)/.test(src));
    assert.deepEqual(rateLimit('flexoffers'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
  });

  it('.env.example AFFILIATE_ID and API_TOKEN empty', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'flexoffers', '.env.example'),
      'utf8',
    );
    for (const key of [
      'FLEXOFFERS_AFFILIATE_ID=',
      'FLEXOFFERS_API_TOKEN=',
      'MSSQL_PASSWORD=',
    ]) {
      const line = envEx.split(/\r?\n/).find((l) => l.startsWith(key));
      assert.equal(line, key);
    }
  });
});

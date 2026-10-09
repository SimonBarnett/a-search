'use strict';

/**
 * MRB #789 hostile pins for FR-090 tradedoubler selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeTradedoublerSelftest,
  tradedoublerSelftestProbe,
} = require('../providers/local/tradedoubler/src/selftestProbe');

describe('MRB-789 FR-090 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('tradedoubler'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'tradedoubler');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeTradedoublerSelftest({
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
    assert.equal(ok.source, 'tradedoubler');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await tradedoublerSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('skill Selftest + pacing and Maintainer feed-parser both present', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'tradedoubler',
        '.grok',
        'skills',
        'a-search-tradedoubler',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Selftest \+ pacing \(FR-090\)/);
    assert.match(skill, /## Maintainer feed-parser \(FR-091\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
  });

  it('fr058b no-rateLimit example is __no_such_source__ not tradedoubler/admitad/flexoffers', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
    assert.ok(!/assert\.equal\(rateLimit\('tradedoubler'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('admitad'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('flexoffers'\),\s*undefined\)/.test(src));
    assert.deepEqual(rateLimit('flexoffers'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.equal(rateLimit('__no_such_source__'), undefined);
  });

  it('.env.example keep-both FR-091 feed keys and FR-090 API token empty', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'tradedoubler', '.env.example'),
      'utf8',
    );
    for (const key of [
      'TRADEDOUBLER_FEED_URL=',
      'TRADEDOUBLER_API_KEY=',
      'TRADEDOUBLER_API_TOKEN=',
    ]) {
      const line = envEx.split(/\r?\n/).find((l) => l.startsWith(key));
      assert.equal(line, key);
    }
  });
});
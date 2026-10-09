'use strict';

/**
 * MRB #728 hostile pins for FR-084 partnerize selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probePartnerizeSelftest,
  partnerizeSelftestProbe,
} = require('../providers/local/partnerize/src/selftestProbe');

describe('MRB-728 FR-084 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    const rl = rateLimit('partnerize');
    assert.deepEqual(rl, { maxConcurrency: 1, minIntervalMs: 250 });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'partnerize');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probePartnerizeSelftest({
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
    assert.equal(ok.source, 'partnerize');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.ok(ok.latencyMs >= 0);
    assert.equal(ok.error, undefined);

    const bad = await partnerizeSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('skill Selftest + pacing heading + peer pacing numbers', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'partnerize',
        '.grok',
        'skills',
        'a-search-partnerize',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Selftest \+ pacing \(FR-084\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
  });

  it('fr058b no-rateLimit example is __no_such_source__ (locals all have rateLimit)', () => {
    // FR-112+ gave every Phase-2 local rateLimit; fr058b uses an unknown id.
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
    assert.ok(!/assert\.equal\(rateLimit\('admitad'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('partnerize'\),\s*undefined\)/.test(src));
    assert.ok(!/assert\.equal\(rateLimit\('webgains'\),\s*undefined\)/.test(src));
    assert.deepEqual(rateLimit('admitad'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    assert.ok(rateLimit('tradedoubler'));
    assert.equal(rateLimit('__no_such_source__'), undefined);
  });

  it('.env.example keeps FR-085 feed keys and FR-084 API token empty', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'partnerize', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /PARTNERIZE_FEED_URL=/);
    assert.match(envEx, /PARTNERIZE_API_KEY=/);
    assert.match(envEx, /PARTNERIZE_API_TOKEN=/);
    for (const key of [
      'PARTNERIZE_FEED_URL=',
      'PARTNERIZE_API_KEY=',
      'PARTNERIZE_API_TOKEN=',
    ]) {
      const line = envEx.split(/\r?\n/).find((l) => l.startsWith(key));
      assert.equal(line, key);
    }
  });
});
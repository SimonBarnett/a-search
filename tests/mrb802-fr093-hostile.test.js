'use strict';

/**
 * MRB #802 hostile pins for FR-093 admitad selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeAdmitadSelftest,
  admitadSelftestProbe,
} = require('../providers/local/admitad/src/selftestProbe');

describe('MRB-802 FR-093 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    assert.deepEqual(rateLimit('admitad'), {
      maxConcurrency: 1,
      minIntervalMs: 250,
    });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'admitad');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeAdmitadSelftest({
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
    assert.equal(ok.source, 'admitad');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.equal(ok.error, undefined);

    const bad = await admitadSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('token feed-ready path without MSSQL', async () => {
    const out = await probeAdmitadSelftest({
      env: { ADMITAD_API_TOKEN: 'tok-test' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'admitad');
  });

  it('skill Selftest + pacing + FR-092 Search path both present', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'admitad',
        '.grok',
        'skills',
        'a-search-admitad',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Selftest \+ pacing \(FR-093\)/);
    assert.match(skill, /## Search path \(FR-092\)/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
  });

  it('fr058b no-rateLimit example is flexoffers not admitad', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('flexoffers'\)/);
    assert.ok(!/rateLimit\('admitad'\)\s*,\s*undefined/.test(src));
    assert.equal(rateLimit('flexoffers'), undefined);
  });

  it('.env.example keep-both WEBSITE_ID and API_TOKEN empty', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'admitad', '.env.example'),
      'utf8',
    );
    for (const key of ['ADMITAD_WEBSITE_ID=', 'ADMITAD_API_TOKEN=', 'MSSQL_PASSWORD=']) {
      const line = envEx.split(/\r?\n/).find((l) => l.startsWith(key));
      assert.equal(line, key);
    }
  });
});

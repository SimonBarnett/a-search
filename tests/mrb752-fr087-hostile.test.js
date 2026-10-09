'use strict';

/**
 * MRB #752 hostile pins for FR-087 webgains selftestProbe + rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { rateLimit } = require('../providers/loadRegistry');
const {
  probeWebgainsSelftest,
  webgainsSelftestProbe,
  PROBE_SQL,
} = require('../providers/local/webgains/src/selftestProbe');

describe('MRB-752 FR-087 hostile', () => {
  it('rateLimit maxConcurrency=1 minIntervalMs=250; stay-dark', () => {
    const rl = rateLimit('webgains');
    assert.deepEqual(rl, { maxConcurrency: 1, minIntervalMs: 250 });
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'webgains');
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('PROBE_SQL pins Source=webgains', () => {
    assert.match(PROBE_SQL, /dbo\.Parts/i);
    assert.match(PROBE_SQL, /Source\s*=\s*N'webgains'/i);
  });

  it('probe contract { ok, source, latencyMs, error? }', async () => {
    const ok = await probeWebgainsSelftest({
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
    assert.equal(ok.source, 'webgains');
    assert.equal(typeof ok.latencyMs, 'number');
    assert.ok(ok.latencyMs >= 0);
    assert.equal(ok.error, undefined);

    const bad = await webgainsSelftestProbe('ebay', { env: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'wrong_source');
  });

  it('WEBGAINS_API_TOKEN alone marks feed-ready ok', async () => {
    const r = await probeWebgainsSelftest({
      env: { WEBGAINS_API_TOKEN: ' tok ' },
    });
    assert.equal(r.ok, true);
    assert.equal(r.source, 'webgains');
  });

  it('fr058b no-rateLimit example is __no_such_source__ not webgains', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
    assert.doesNotMatch(src, /rateLimit\(['\"]webgains['\"]\)\s*===?\s*undefined/);
    assert.ok(!/assert\.equal\(rateLimit\('admitad'\),\s*undefined\)/.test(src));
  });

  it('skill Selftest + pacing (FR-087) + stay-dark', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'webgains',
        '.grok',
        'skills',
        'a-search-webgains',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-087/);
    assert.match(skill, /Selftest \+ pacing/);
    assert.match(skill, /stay-dark|enabled\.live\s*=\s*false/i);
    assert.match(skill, /rateLimit|minIntervalMs/);
  });

  it('.env.example has empty WEBGAINS_API_TOKEN placeholder', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'webgains', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /WEBGAINS_API_TOKEN=/);
    const line = envEx.split(/\r?\n/).find((l) => l.startsWith('WEBGAINS_API_TOKEN='));
    assert.equal(line, 'WEBGAINS_API_TOKEN=');
  });
});

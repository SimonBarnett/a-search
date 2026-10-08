'use strict';

/**
 * FR-093: admitad selftestProbe + registry rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeAdmitadSelftest,
  admitadSelftestProbe,
  PROBE_SQL,
} = require('../providers/local/admitad/src/selftestProbe');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
};

function mockPoolOk() {
  return {
    request() {
      return {
        async query(sqlText) {
          assert.match(sqlText, /dbo\.Parts/i);
          assert.match(sqlText, /Source = N'admitad'/);
          return { recordset: [{ ok: 1 }] };
        },
      };
    },
    async close() {},
  };
}

describe('FR-093 admitad selftestProbe + rateLimit', () => {
  it('ok true when MSSQL Parts reachable (injectable connect)', async () => {
    let connects = 0;
    const result = await probeAdmitadSelftest({
      env: mssqlEnv,
      connect: async (cfg) => {
        connects += 1;
        assert.equal(cfg.server, 'sql.test');
        return mockPoolOk();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'admitad');
    assert.equal(connects, 1);
    assert.equal(result.error, undefined);
    assert.equal(typeof result.latencyMs, 'number');
  });

  it('ok false when MSSQL config missing and no API token', async () => {
    const result = await probeAdmitadSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'admitad');
    assert.equal(result.error, 'admitad_mssql_missing_config');
  });

  it('ok true when API token present even without MSSQL', async () => {
    const result = await probeAdmitadSelftest({
      env: {
        A_SEARCH_ENV: 'sandbox',
        ADMITAD_API_TOKEN: 'token-test',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'admitad');
  });

  it('ok false when MSSQL unreachable and no API token', async () => {
    const result = await probeAdmitadSelftest({
      env: mssqlEnv,
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'admitad');
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('ok true when MSSQL fails but API token present', async () => {
    const result = await probeAdmitadSelftest({
      env: { ...mssqlEnv, ADMITAD_API_TOKEN: 'token-test' },
      connect: async () => {
        throw new Error('timeout');
      },
    });
    assert.equal(result.ok, true);
  });

  it('admitadSelftestProbe rejects non-admitad source', async () => {
    const result = await admitadSelftestProbe('awin', { env: mssqlEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'awin');
    assert.equal(result.error, 'wrong_source');
  });

  it('probe SQL and module path exist', () => {
    assert.match(PROBE_SQL, /dbo\.Parts/);
    assert.match(PROBE_SQL, /admitad/);
    const p = path.join(
      root,
      'providers',
      'local',
      'admitad',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'admitad');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.ok(row.rateLimit);
    assert.equal(typeof row.rateLimit.maxConcurrency, 'number');
    assert.ok(row.rateLimit.maxConcurrency > 0);
    assert.equal(typeof row.rateLimit.minIntervalMs, 'number');
    assert.ok(row.rateLimit.minIntervalMs >= 0);
  });

  it('skill documents selftest + pacing', () => {
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
    assert.match(skill, /selftestProbe\.js/);
    assert.match(skill, /maxConcurrency:\s*1/);
    assert.match(skill, /minIntervalMs:\s*250/);
    assert.ok(!skill.includes('\ufffd'));
  });
});

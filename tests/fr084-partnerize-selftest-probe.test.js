'use strict';

/**
 * FR-084: partnerize selftestProbe + registry rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probePartnerizeSelftest,
  partnerizeSelftestProbe,
  PROBE_SQL,
} = require('../providers/local/partnerize/src/selftestProbe');

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
          assert.match(sqlText, /Source = N'partnerize'/);
          return { recordset: [{ ok: 1 }] };
        },
      };
    },
    async close() {},
  };
}

describe('FR-084 partnerize selftestProbe + rateLimit', () => {
  it('ok true when MSSQL Parts reachable (injectable connect)', async () => {
    let connects = 0;
    const result = await probePartnerizeSelftest({
      env: mssqlEnv,
      connect: async (cfg) => {
        connects += 1;
        assert.equal(cfg.server, 'sql.test');
        return mockPoolOk();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'partnerize');
    assert.equal(connects, 1);
    assert.equal(result.error, undefined);
  });

  it('ok false when MSSQL config missing and no feed token', async () => {
    const result = await probePartnerizeSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'partnerize');
    assert.equal(result.error, 'partnerize_mssql_missing_config');
  });

  it('ok true when feed config present even without MSSQL', async () => {
    const result = await probePartnerizeSelftest({
      env: {
        A_SEARCH_ENV: 'sandbox',
        PARTNERIZE_API_TOKEN: 'token-test',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'partnerize');
  });

  it('ok false when MSSQL unreachable and no feed token', async () => {
    const result = await probePartnerizeSelftest({
      env: mssqlEnv,
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'partnerize');
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('ok true when MSSQL fails but feed token present', async () => {
    const result = await probePartnerizeSelftest({
      env: { ...mssqlEnv, PARTNERIZE_API_TOKEN: 'token-test' },
      connect: async () => {
        throw new Error('timeout');
      },
    });
    assert.equal(result.ok, true);
  });

  it('partnerizeSelftestProbe rejects non-partnerize source', async () => {
    const result = await partnerizeSelftestProbe('awin', { env: mssqlEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'awin');
    assert.equal(result.error, 'wrong_source');
  });

  it('probe SQL and module path exist', () => {
    assert.match(PROBE_SQL, /dbo\.Parts/);
    assert.match(PROBE_SQL, /partnerize/);
    const p = path.join(
      root,
      'providers',
      'local',
      'partnerize',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'partnerize');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.ok(row.rateLimit);
    assert.equal(typeof row.rateLimit.maxConcurrency, 'number');
    assert.ok(row.rateLimit.maxConcurrency > 0);
    assert.equal(typeof row.rateLimit.minIntervalMs, 'number');
    assert.ok(row.rateLimit.minIntervalMs >= 0);
  });
});

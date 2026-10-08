'use strict';

/** FR-059k: impact selftest probe — MSSQL reachable or config; false when neither */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  probeImpactSelftest,
  impactSelftestProbe,
  PROBE_SQL,
} = require('../providers/local/impact/src/selftestProbe');

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
          assert.match(sqlText, /Source = N'impact'/);
          return { recordset: [{ ok: 1 }] };
        },
      };
    },
    async close() {},
  };
}

describe('FR-059k impact selftest probe', () => {
  it('ok true when MSSQL Parts reachable (injectable connect)', async () => {
    let connects = 0;
    const result = await probeImpactSelftest({
      env: mssqlEnv,
      connect: async (cfg) => {
        connects += 1;
        assert.equal(cfg.server, 'sql.test');
        return mockPoolOk();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'impact');
    assert.equal(connects, 1);
    assert.equal(result.error, undefined);
  });

  it('ok false when MSSQL config missing and no campaign id', async () => {
    const result = await probeImpactSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'impact');
    assert.equal(result.error, 'impact_mssql_missing_config');
  });

  it('ok true when IMPACT_CAMPAIGN_ID present even without MSSQL', async () => {
    const result = await probeImpactSelftest({
      env: {
        A_SEARCH_ENV: 'sandbox',
        IMPACT_CAMPAIGN_ID: 'camp-test',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'impact');
  });

  it('ok false when MSSQL unreachable and no campaign id', async () => {
    const result = await probeImpactSelftest({
      env: mssqlEnv,
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'impact');
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('ok true when MSSQL fails but campaign id present', async () => {
    const result = await probeImpactSelftest({
      env: { ...mssqlEnv, IMPACT_CAMPAIGN_ID: 'camp-test' },
      connect: async () => {
        throw new Error('timeout');
      },
    });
    assert.equal(result.ok, true);
  });

  it('impactSelftestProbe rejects non-impact source', async () => {
    const result = await impactSelftestProbe('awin', { env: mssqlEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'awin');
    assert.equal(result.error, 'wrong_source');
  });

  it('probe SQL and module path exist', () => {
    assert.match(PROBE_SQL, /dbo\.Parts/);
    assert.match(PROBE_SQL, /impact/);
    const p = path.join(
      __dirname,
      '..',
      'providers',
      'local',
      'impact',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});

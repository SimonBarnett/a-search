'use strict';

/** FR-059j: awin selftest probe — MSSQL reachable or feed config; false when neither */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  probeAwinSelftest,
  awinSelftestProbe,
  PROBE_SQL,
} = require('../providers/local/awin/src/selftestProbe');

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
          assert.match(sqlText, /Source = N'awin'/);
          return { recordset: [{ ok: 1 }] };
        },
      };
    },
    async close() {},
  };
}

describe('FR-059j awin selftest probe', () => {
  it('ok true when MSSQL Parts reachable (injectable connect)', async () => {
    let connects = 0;
    const result = await probeAwinSelftest({
      env: mssqlEnv,
      connect: async (cfg) => {
        connects += 1;
        assert.equal(cfg.server, 'sql.test');
        return mockPoolOk();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'awin');
    assert.equal(connects, 1);
    assert.equal(result.error, undefined);
  });

  it('ok false when MSSQL config missing and no feed token', async () => {
    const result = await probeAwinSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'awin');
    assert.equal(result.error, 'awin_mssql_missing_config');
  });

  it('ok true when feed config present even without MSSQL', async () => {
    const result = await probeAwinSelftest({
      env: {
        A_SEARCH_ENV: 'sandbox',
        AWIN_API_TOKEN: 'token-test',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'awin');
  });

  it('ok false when MSSQL unreachable and no feed token', async () => {
    const result = await probeAwinSelftest({
      env: mssqlEnv,
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'awin');
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('ok true when MSSQL fails but feed token present', async () => {
    const result = await probeAwinSelftest({
      env: { ...mssqlEnv, AWIN_API_TOKEN: 'token-test' },
      connect: async () => {
        throw new Error('timeout');
      },
    });
    assert.equal(result.ok, true);
  });

  it('awinSelftestProbe rejects non-awin source', async () => {
    const result = await awinSelftestProbe('ebay', { env: mssqlEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('probe SQL and module path exist', () => {
    assert.match(PROBE_SQL, /dbo\.Parts/);
    const p = path.join(
      __dirname,
      '..',
      'providers',
      'local',
      'awin',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});

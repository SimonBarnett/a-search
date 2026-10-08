'use strict';

/**
 * FR-108: wix selftestProbe + registry rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeWixSelftest,
  wixSelftestProbe,
  PROBE_SQL,
} = require('../providers/local/wix/src/selftestProbe');

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
          assert.match(sqlText, /Source = N'wix'/);
          return { recordset: [{ ok: 1 }] };
        },
      };
    },
    async close() {},
  };
}

describe('FR-108 wix selftestProbe + rateLimit', () => {
  it('ok true when MSSQL Parts reachable (injectable connect)', async () => {
    let connects = 0;
    const result = await probeWixSelftest({
      env: mssqlEnv,
      connect: async (cfg) => {
        connects += 1;
        assert.equal(cfg.server, 'sql.test');
        return mockPoolOk();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'wix');
    assert.equal(connects, 1);
    assert.equal(result.error, undefined);
    assert.equal(typeof result.latencyMs, 'number');
  });

  it('ok false when MSSQL config missing and no access token', async () => {
    const result = await probeWixSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'wix');
    assert.equal(result.error, 'wix_mssql_missing_config');
  });

  it('ok true when WIX_API_TOKEN present even without MSSQL', async () => {
    const result = await probeWixSelftest({
      env: {
        A_SEARCH_ENV: 'sandbox',
        WIX_API_TOKEN: 'wix_test_fixture_token',
      },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'wix');
  });

  it('ok false when MSSQL unreachable and no access token', async () => {
    const result = await probeWixSelftest({
      env: mssqlEnv,
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'wix');
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('ok true when MSSQL fails but access token present', async () => {
    const result = await probeWixSelftest({
      env: { ...mssqlEnv, WIX_API_TOKEN: 'wix_test_fixture_token' },
      connect: async () => {
        throw new Error('timeout');
      },
    });
    assert.equal(result.ok, true);
  });

  it('wixSelftestProbe rejects non-wix source', async () => {
    const result = await wixSelftestProbe('awin', { env: mssqlEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'awin');
    assert.equal(result.error, 'wrong_source');
  });

  it('probe SQL and module path exist', () => {
    assert.match(PROBE_SQL, /dbo\.Parts/);
    assert.match(PROBE_SQL, /wix/);
    const p = path.join(
      root,
      'providers',
      'local',
      'wix',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'wix');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.ok(row.rateLimit);
    assert.equal(row.rateLimit.maxConcurrency, 1);
    assert.equal(row.rateLimit.minIntervalMs, 250);
  });

  it('skill documents selftest + pacing', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'wix',
        '.grok',
        'skills',
        'a-search-wix',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /selftestProbe\.js/);
    assert.match(skill, /rateLimit|maxConcurrency|minIntervalMs/);
    assert.match(skill, /## Selftest \+ pacing \(FR-108\)/);
    assert.match(skill, /FR-108/);
    assert.ok(!skill.includes('\ufffd'));
  });
});

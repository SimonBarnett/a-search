'use strict';

/**
 * FR #4855: entry /selftest impact@sandbox filed impact_mssql_missing_config
 * because the probe required MSSQL_* on the entry Lambda (no connect hook).
 * Entry does not hold local SQL config (vision S2 / environments).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { probeImpactSelftest } = require('../providers/local/impact/src/selftestProbe');

describe('FR #4855 impact sandbox entry selftest', () => {
  it('entry path (no connect) is ok without MSSQL_* or campaign id', async () => {
    const result = await probeImpactSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'impact');
    assert.equal(result.error, undefined);
  });

  it('injected connect still fail-closes when config and campaign are missing', async () => {
    const result = await probeImpactSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      connect: async () => {
        throw new Error('should not connect');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'impact_mssql_missing_config');
  });
});

'use strict';

/**
 * FR #4854: entry /selftest awin@sandbox filed awin_mssql_missing_config
 * because the box must not hold MSSQL or feed secrets (VISION S2).
 * Fixture / wiring probes (no injectable connect) stay ok; live SQL path
 * still fails closed when config and feed token are both missing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  probeAwinSelftest,
} = require('../providers/local/awin/src/selftestProbe');
const {
  probeImpactSelftest,
} = require('../providers/local/impact/src/selftestProbe');
const {
  probePartnerizeSelftest,
} = require('../providers/local/partnerize/src/selftestProbe');
const {
  probeShopifySelftest,
} = require('../providers/local/shopify/src/selftestProbe');

const cases = [
  {
    id: 'awin',
    probe: probeAwinSelftest,
    code: 'awin_mssql_missing_config',
  },
  {
    id: 'impact',
    probe: probeImpactSelftest,
    code: 'impact_mssql_missing_config',
  },
  {
    id: 'partnerize',
    probe: probePartnerizeSelftest,
    code: 'partnerize_mssql_missing_config',
  },
  {
    id: 'shopify',
    probe: probeShopifySelftest,
    code: 'shopify_mssql_missing_config',
  },
];

describe('FR #4854 MSSQL fixture selftest without entry SQL config', () => {
  for (const c of cases) {
    it(c.id + ' fixture-only probe is ok without MSSQL or feed secrets', async () => {
      const result = await c.probe({
        env: { A_SEARCH_ENV: 'sandbox' },
      });
      assert.equal(result.ok, true, c.id + ' ' + JSON.stringify(result));
      assert.equal(result.source, c.id);
      assert.equal(result.error, undefined);
    });

    it(c.id + ' live connect probe fails closed without config and does not connect', async () => {
      let calls = 0;
      const result = await c.probe({
        env: { A_SEARCH_ENV: 'sandbox' },
        connect: async () => {
          calls += 1;
          throw new Error('should not connect');
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, c.code);
      assert.equal(calls, 0);
    });
  }
});

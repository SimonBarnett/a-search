'use strict';

/**
 * FR #4850: entry /selftest rakuten@sandbox filed rakuten_missing_credentials
 * because the fixture probe required RAKUTEN_* on the entry Lambda (vision S2).
 * Same class: cj #4851, kelkoo #4852, skimlinks #4853.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  probeRakutenSelftest,
} = require('../providers/live/rakuten/src/selftestProbe');
const { probeCjSelftest } = require('../providers/live/cj/src/selftestProbe');
const {
  probeKelkooSelftest,
} = require('../providers/live/kelkoo/src/selftestProbe');
const {
  probeSkimlinksSelftest,
} = require('../providers/local/skimlinks/src/selftestProbe');

const CASES = [
  {
    id: 'rakuten',
    probe: probeRakutenSelftest,
    code: 'rakuten_missing_credentials',
  },
  { id: 'cj', probe: probeCjSelftest, code: 'cj_missing_credentials' },
  {
    id: 'kelkoo',
    probe: probeKelkooSelftest,
    code: 'kelkoo_missing_credentials',
  },
  {
    id: 'skimlinks',
    probe: probeSkimlinksSelftest,
    code: 'skimlinks_missing_credentials',
  },
];

describe('FR #4850 live fixture selftest without entry provider secrets', () => {
  for (const c of CASES) {
    it(c.id + ' fixture-only probe is ok without provider secrets', async () => {
      const result = await c.probe({ env: { A_SEARCH_ENV: 'sandbox' } });
      assert.equal(result.ok, true, c.id + ' ' + JSON.stringify(result));
      assert.equal(result.source, c.id);
      assert.equal(result.error, undefined);
    });

    it(c.id + ' HTTP probe fails closed without creds and does not call vendor', async () => {
      const httpCalls = [];
      const result = await c.probe({
        env: { A_SEARCH_ENV: 'sandbox' },
        httpRequest: async () => {
          httpCalls.push(1);
          throw new Error('should not call');
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, c.code);
      assert.equal(httpCalls.length, 0);
    });
  }
});

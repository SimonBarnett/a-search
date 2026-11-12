'use strict';

/**
 * MRB #5331 hostile pin for FR #5318:
 * - one CJ product => one IN key with searchid and -cj.json
 * - IN Body products length 1
 * - _search-done serviced products=1
 * - zero-product CJ still writes no IN
 * - env uses FAKE_ token placeholder only
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { run: runCj } = require('../providers/live/cj/src/worker');

const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const HOST = 'www.mymodelflyingclub.co.uk';
const SEARCHID = 'srch_mrb5331_cj';

const cjEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  CJ_API_TOKEN: 'FAKE_cj_token',
  CJ_WEBSITE_ID: '12345',
};

function minimalProduct(id) {
  return {
    id: id || 'p1',
    title: 'Fixture part',
    url: 'https://example.test/p/1',
    price: 9.99,
    currency: 'GBP',
    source: 'test',
  };
}

describe('MRB #5331 hostile FR #5318 CJ one product', () => {
  it('one product: IN key, body, and _search-done', async () => {
    assert.match(cjEnv.CJ_API_TOKEN, /^FAKE_/);
    const puts = [];
    const msg = {
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      env: 'sandbox',
      source: 'cj',
      searchId: SEARCHID,
    };
    const out = await runCj(msg, {
      env: cjEnv,
      searchCj: async () => [minimalProduct('cj-hostile-1')],
      putObject: async (args) => {
        puts.push(args);
        return {};
      },
      touchLastmod: async () => {},
    });
    assert.equal(out.ok, true);
    assert.equal(out.products.length, 1);
    const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
    assert.equal(inPuts.length, 1);
    assert.match(String(inPuts[0].Key), new RegExp(`${SEARCHID}.*-cj\\.json$`));
    const inBody = JSON.parse(String(inPuts[0].Body || '{}'));
    const products = inBody.products || inBody.items || inBody;
    if (Array.isArray(products)) {
      assert.equal(products.length, 1);
    } else {
      assert.ok(inBody.products === 1 || (inBody.products && inBody.products.length === 1));
    }
    const donePuts = puts.filter(
      (p) => String(p.Key || '') === `_search-done/${SEARCHID}/cj.json`,
    );
    assert.equal(donePuts.length, 1);
    const doneBody = JSON.parse(String(donePuts[0].Body || '{}'));
    assert.equal(doneBody.status, 'serviced');
    assert.equal(doneBody.products, 1);
  });

  it('zero products: still no IN put', async () => {
    const puts = [];
    const msg = {
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      env: 'sandbox',
      source: 'cj',
      searchId: SEARCHID,
    };
    const out = await runCj(msg, {
      env: cjEnv,
      searchCj: async () => [],
      putObject: async (args) => {
        puts.push(args);
        return {};
      },
      touchLastmod: async () => {},
    });
    assert.equal(out.ok, true);
    assert.deepEqual(out.products, []);
    const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
    assert.equal(inPuts.length, 0);
  });
});

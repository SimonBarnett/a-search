'use strict';

/**
 * FR #5266: SQL normalizePart must keep FREETEXT RANK on every IN/sql.json part.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { normalizePart, run } = require('../providers/local/sql/src/worker');

const ROW = {
  Source: 'awin',
  FeedKey: 'fk',
  MerchantProductId: 'mp-1',
  Title: 'Volantex Sport Cub 761-14 RTF',
  Description: 'filter hit',
  Url: 'https://example.test/p',
  Price: 12.5,
  Currency: 'GBP',
  Rank: 18,
};

describe('FR #5266 SQL normalizePart keeps rank', () => {
  it('normalizePart copies Rank / RANK / rank as a finite number', () => {
    const a = normalizePart(ROW);
    assert.equal(a.rank, 18);
    assert.equal(typeof a.rank, 'number');
    assert.equal(normalizePart({ ...ROW, Rank: undefined, RANK: 42 }).rank, 42);
    assert.equal(normalizePart({ ...ROW, Rank: undefined, rank: 7 }).rank, 7);
  });

  it('missing rank still keeps the row with numeric rank 0 (never drops)', () => {
    const p = normalizePart({ ...ROW, Rank: undefined, RANK: undefined, rank: undefined });
    assert.equal(p.id, 'mp-1');
    assert.equal(p.rank, 0);
  });

  it('run writes every product rank into IN/sql.json and does not trim by rank', async () => {
    /** @type {string} */
    let bodyText = '';
    const out = await run(
      {
        env: 'live',
        searchid: 'srch_rank',
        hostkey: 'www.example.test',
        guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
        queries: [{ q: 'VOLANTEXRC Sport Cub' }],
      },
      {
        env: { A_SEARCH_ENV: 'live', S3_RESULTS_BUCKET: 'a-clubs' },
        queryParts: async () => [
          { ...ROW, MerchantProductId: 'low', Rank: 18 },
          { ...ROW, MerchantProductId: 'high', Rank: 200 },
        ],
        putObject: async ({ Body }) => {
          bodyText = String(Body);
        },
        touchLastmod: async () => {},
      },
    );
    assert.equal(out.products.length, 2);
    assert.deepEqual(
      out.products.map((p) => p.rank),
      [18, 200],
    );
    const written = JSON.parse(bodyText);
    assert.equal(written.products.length, 2);
    assert.ok(written.products.every((p) => Number.isFinite(p.rank)));
    assert.equal(written.products[0].rank, 18);
    assert.equal(written.products[1].rank, 200);
  });
});

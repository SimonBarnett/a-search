'use strict';

/**
 * FR #5263: SQL returns every gate-passing row with RANK. No SELECT TOP
 * from maxResults, no FREETEXTTABLE top_n that can hide later hits.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const qp = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

function mockConnect(recordset, inputsOut) {
  return async () => ({
    request() {
      return {
        input(name, _type, value) {
          inputsOut[name] = value;
          return this;
        },
        async query() {
          return { recordset };
        },
      };
    },
    close() {},
  });
}

const SQL_DEPS = {
  env: {
    MSSQL_SERVER: 'walrus\\ASEARCH',
    MSSQL_DATABASE: 'a_search',
    MSSQL_USER: 'a_search_drain',
    A_SEARCH_SQL_TOP: '500',
    A_SEARCH_SQL_MIN_RANK: '50',
  },
  sqlTypes: {
    NVarChar: (n) => ({ kind: 'NVarChar', length: n }),
    Int: 'Int',
  },
};

describe('FR #5263 SQL keeps every filter-passing row', () => {
  it('buildSelectSql has no TOP (@n) and no FREETEXTTABLE top_n', () => {
    const sql = qp.buildSelectSql(0, 1);
    assert.doesNotMatch(sql, /SELECT\s+TOP/i);
    assert.doesNotMatch(sql, /FREETEXTTABLE\s*\([^)]+,\s*@top\s*\)/i);
    assert.match(
      sql,
      /FREETEXTTABLE\s*\(\s*dbo\.Parts\s*,\s*\(\s*Title\s*,\s*Description\s*,\s*Brand\s*,\s*Mpn\s*,\s*MerchantSku\s*\)\s*,\s*@q\s*\)/i,
    );
    assert.match(sql, /ft\.\[RANK\]\s+AS\s+Rank/i);
    assert.match(sql, /ft\.\[RANK\]\s*>=\s*@minRank/i);
  });

  it('returns a gate-passing row even when text position would exceed 500 / maxResults', async () => {
    const inputs = {};
    const rows = await qp.defaultQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      {
        ...SQL_DEPS,
        connect: mockConnect(
          [
            {
              Title: 'Volantex Sport Cub 761-14 RTF',
              Description: 'filter hit at FREETEXT position 5412',
              Rank: 18,
            },
          ],
          inputs,
        ),
      },
    );
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'n'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'top'), false);
    assert.equal(inputs.minRank, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Rank, 18);
  });

  it('returns more than maxResults gate-passing rows', async () => {
    const inputs = {};
    const recordset = Array.from({ length: 15 }, (_, i) => ({
      Title: `Volantex Sport Cub 761-14 row-${i}`,
      Description: 'gated',
      Rank: 200 - i,
    }));
    const rows = await qp.defaultQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      { ...SQL_DEPS, connect: mockConnect(recordset, inputs) },
    );
    assert.equal(rows.length, 15);
    assert.ok(rows.every((r) => Number.isFinite(Number(r.Rank))));
  });

  it('returns 0 when no row passes gates', async () => {
    const rows = await qp.defaultQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      { ...SQL_DEPS, connect: mockConnect([], {}) },
    );
    assert.equal(rows.length, 0);
  });

  it('docs drop maxResults output trim and FREETEXTTABLE top_n', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5263|#5263/);
    assert.doesNotMatch(text, /Final output is still trimmed to\s*`maxResults`/);
    assert.match(text, /no FREETEXTTABLE top_n|without top_n|omit top_n/i);
  });
});

describe('FR #5263 live providers keep downloaded items', () => {
  it('Rakuten requests max=50 and keeps more than maxResults items', async () => {
    const {
      searchRakuten,
      resetRakutenTokenCache,
    } = require('../providers/live/rakuten/src/search');
    resetRakutenTokenCache();
    const items = Array.from({ length: 12 }, (_, i) => {
      return (
        `<item><productid>p${i}</productid>` +
        `<productname>Grey Sofa ${i}</productname><price>1</price></item>`
      );
    }).join('');
    const urls = [];
    const out = await searchRakuten(
      {
        q: 'sofa',
        maxResults: 10,
        userId: 'U1',
        env: 'sandbox',
      },
      {
        env: {
          RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
          RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
          RAKUTEN_SID: 'FAKE_sid',
        },
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                access_token: 'FAKE_access_token',
                expires_in: 3600,
              }),
            };
          }
          urls.push(String(req.url || ''));
          return {
            statusCode: 200,
            body: `<result><TotalMatches>12</TotalMatches>${items}</result>`,
          };
        },
      },
    );
    assert.equal(new URL(urls[0]).searchParams.get('max'), '50');
    assert.equal(out.length, 12);
  });
});

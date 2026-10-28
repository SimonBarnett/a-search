'use strict';

/**
 * FR #5256: FREETEXTTABLE @top must be the candidate pool (A_SEARCH_SQL_TOP),
 * not maxResults. SELECT TOP (@n) still trims. Filter-matching rows with low
 * RANK are kept when brand/model gates are present (minRank 0).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const qp = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

describe('FR #5256 FREETEXTTABLE top vs maxResults', () => {
  it('resolveSqlFreetextTop uses A_SEARCH_SQL_TOP while resolveSqlRowLimit uses maxResults', () => {
    const env = { A_SEARCH_SQL_TOP: '500' };
    const msg = { queries: [{ q: 'servo', maxResults: 10 }] };
    assert.equal(qp.resolveSqlRowLimit(msg, env), 10);
    assert.equal(qp.resolveSqlFreetextTop(msg, env), 500);
  });

  it('sqlMinRankForSelect is 0 when gates are present (low-rank filter hits)', () => {
    assert.equal(qp.sqlMinRankForSelect({ A_SEARCH_SQL_MIN_RANK: '50' }, 2), 0);
    assert.equal(qp.sqlMinRankForSelect({ A_SEARCH_SQL_MIN_RANK: '50' }, 0), 50);
  });

  it('defaultQueryParts binds n=maxResults, top=SQL_TOP, minRank=0 with gates', async () => {
    /** @type {Record<string, unknown>} */
    const inputs = {};
    const rows = await qp.defaultQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      {
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
        connect: async () => ({
          request() {
            return {
              input(name, _type, value) {
                inputs[name] = value;
                return this;
              },
              async query() {
                // Fixture: 10 high-rank junk + one filter hit at rank 18 (below
                // old top_n=10 and old minRank=50). Candidate pool is @top.
                assert.ok(Number(inputs.top) >= 500);
                assert.equal(inputs.n, 10);
                assert.equal(inputs.minRank, 0);
                return {
                  recordset: [
                    {
                      Title: 'Volantex Sport Cub 761-14 RTF',
                      Description: 'filter-matching row at rank 18',
                      RANK: 18,
                    },
                  ],
                };
              },
            };
          },
          close() {},
        }),
      },
    );
    assert.equal(inputs.n, 10);
    assert.equal(inputs.top, 500);
    assert.equal(inputs.minRank, 0);
    assert.ok(rows.length >= 1);
  });

  it('defaultQueryParts returns 0 when no row passes filters', async () => {
    const rows = await qp.defaultQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      {
        env: {
          MSSQL_SERVER: 'walrus\\ASEARCH',
          MSSQL_DATABASE: 'a_search',
          MSSQL_USER: 'a_search_drain',
        },
        sqlTypes: {
          NVarChar: (n) => ({ kind: 'NVarChar', length: n }),
          Int: 'Int',
        },
        connect: async () => ({
          request() {
            return {
              input() {
                return this;
              },
              async query() {
                return { recordset: [] };
              },
            };
          },
          close() {},
        }),
      },
    );
    assert.equal(rows.length, 0);
  });

  it('docs pin FR #5256 candidate @top and gated minRank 0', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5256|#5256/);
    assert.match(text, /@top/);
    assert.match(text, /minRank|min RANK/i);
  });
});

'use strict';

/**
 * FR #5256 / #5263: gated minRank is 0. Output is not trimmed by maxResults
 * or FREETEXTTABLE top_n (superseded by #5263).
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

  it('defaultQueryParts binds minRank=0 with gates and does not bind n/top', async () => {
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
                assert.equal(inputs.minRank, 0);
                assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'n'), false);
                assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'top'), false);
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
    assert.equal(inputs.minRank, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'n'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'top'), false);
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

  it('docs pin FR #5256/#5263 gated minRank 0 and no top_n trim', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5256|#5256/);
    assert.match(text, /#5263/);
    assert.match(text, /minRank|min RANK/i);
    assert.doesNotMatch(text, /Final output is still trimmed/);
  });
});

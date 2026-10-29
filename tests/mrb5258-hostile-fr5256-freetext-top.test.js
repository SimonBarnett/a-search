'use strict';

/**
 * MRB #5258 hostile pins for FR #5256: FREETEXTTABLE @top is the candidate
 * pool (A_SEARCH_SQL_TOP), not maxResults; gated minRank is 0.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const qp = require('../providers/local/sql/src/queryParts');

describe('MRB #5258 hostile: FR #5256 freetext top vs maxResults', () => {
  it('SELECT_SQL has no TOP and FREETEXTTABLE without top_n (FR #5263)', () => {
    const sql = qp.SELECT_SQL;
    assert.doesNotMatch(sql, /SELECT\s+TOP/i);
    assert.match(
      sql,
      /FREETEXTTABLE\s*\(\s*dbo\.Parts\s*,\s*\(\s*Title\s*,\s*Description\s*,\s*Brand\s*,\s*Mpn\s*,\s*MerchantSku\s*\)\s*,\s*@q\s*\)/i,
    );
    assert.match(sql, /ft\.\[RANK\]\s*>=\s*@minRank/i);
  });

  it('resolveSqlFreetextTop ignores maxResults on the message', () => {
    const env = { A_SEARCH_SQL_TOP: '800' };
    const msg = { queries: [{ q: 'servo', maxResults: 10 }] };
    assert.equal(qp.resolveSqlRowLimit(msg, env), 10);
    assert.equal(qp.resolveSqlFreetextTop(msg, env), 800);
    assert.equal(
      qp.resolveSqlFreetextTop({ queries: [{ q: 'x', maxResults: 3 }] }, env),
      800,
    );
  });

  it('sqlMinRankForSelect is 0 with gates and uses A_SEARCH_SQL_MIN_RANK without', () => {
    const env = { A_SEARCH_SQL_MIN_RANK: '50' };
    assert.equal(qp.sqlMinRankForSelect(env, 1), 0);
    assert.equal(qp.sqlMinRankForSelect(env, 4), 0);
    assert.equal(qp.sqlMinRankForSelect(env, 0), 50);
  });

  it('defaultQueryParts never binds n or top (FR #5263)', async () => {
    /** @type {Record<string, unknown>} */
    const inputs = {};
    await qp.defaultQueryParts(
      {
        env: 'live',
        queries: [
          {
            q: 'VOLANTEXRC Sport Cub S2 761-14 RTF United Kingdom GBP',
            maxResults: 10,
          },
        ],
      },
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
                return { recordset: [] };
              },
            };
          },
          close() {},
        }),
      },
    );
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'n'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'top'), false);
    assert.equal(inputs.minRank, 0);
  });

  it('docs/walrus-sql-drain.md pins FR #5256 contiguous candidate @top + gated minRank 0', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5256/);
    assert.match(text, /without top_n|omit `@top`|no FREETEXTTABLE top_n/i);
    assert.match(text, /#5263/);
    assert.match(
      text,
      /when brand\/model CONTAINS gates are present[\s\S]{0,80}`@minRank` is \*\*0\*\*/i,
    );
  });

  it('queryParts.js exports resolveSqlFreetextTop and sqlMinRankForSelect', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'sql', 'src', 'queryParts.js'),
      'utf8',
    );
    assert.match(src, /function resolveSqlFreetextTop/);
    assert.match(src, /function sqlMinRankForSelect/);
    assert.match(src, /resolveSqlFreetextTop,/);
    assert.match(src, /sqlMinRankForSelect,/);
    assert.match(src, /omits FREETEXTTABLE/);
  });
});

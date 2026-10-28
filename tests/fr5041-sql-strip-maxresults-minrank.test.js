'use strict';

/**
 * FR #5041: strip annotator location/currency from SQL FREETEXT;
 * honour maxResults; minimum RANK threshold.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  stripAnnotatorLocationCurrency,
  buildFreetextQuery,
  resolveSqlRowLimit,
  sqlMinRank,
  sqlTopLimit,
  buildSelectSql,
  defaultQueryParts,
} = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

const PRODUCT_NEEDLES = [
  'VOLANTEXRC',
  'Sport',
  'Cub',
  '761-14',
  '3CH',
  'RTF',
  'Xpilot',
  'beginner',
];

describe('FR #5041 stripAnnotatorLocationCurrency', () => {
  it('strips country, parenthetical locality, and GBP from VOLANTEXRC query', () => {
    const out = stripAnnotatorLocationCurrency(ANNOTATOR_Q);
    for (const w of PRODUCT_NEEDLES) {
      assert.match(out, new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    assert.doesNotMatch(out, /United\s+Kingdom/i);
    assert.doesNotMatch(out, /Lathom/i);
    assert.doesNotMatch(out, /Ormskirk/i);
    assert.doesNotMatch(out, /L40/i);
    assert.doesNotMatch(out, /\.co\.uk/i);
    assert.doesNotMatch(out, /\bGBP\b/i);
    assert.doesNotMatch(out, /[()]/);
  });

  it('leaves queries without a location/currency suffix unchanged', () => {
    const q = 'VOLANTEXRC Sport Cub S2 RTF';
    assert.equal(stripAnnotatorLocationCurrency(q), q);
    assert.equal(buildFreetextQuery({ queries: [q] }), q);
  });

  it('buildFreetextQuery uses stripped text for annotator-shaped queries', () => {
    const q = buildFreetextQuery({
      queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
    });
    assert.doesNotMatch(q, /United\s+Kingdom/i);
    assert.doesNotMatch(q, /\bGBP\b/i);
    assert.match(q, /VOLANTEXRC/i);
    assert.match(q, /Xpilot/i);
  });
});

describe('FR #5041 maxResults and min RANK', () => {
  it('resolveSqlRowLimit honours maxResults capped by A_SEARCH_SQL_TOP', () => {
    assert.equal(sqlTopLimit({ A_SEARCH_SQL_TOP: '500' }), 500);
    assert.equal(
      resolveSqlRowLimit(
        { queries: [{ q: 'servo', maxResults: 10 }] },
        { A_SEARCH_SQL_TOP: '500' },
      ),
      10,
    );
    assert.equal(
      resolveSqlRowLimit(
        { queries: [{ q: 'servo', maxResults: 900 }] },
        { A_SEARCH_SQL_TOP: '500' },
      ),
      500,
    );
    assert.equal(
      resolveSqlRowLimit({ queries: [{ q: 'servo' }] }, { A_SEARCH_SQL_TOP: '25' }),
      25,
    );
  });

  it('sqlMinRank defaults to 50 and reads A_SEARCH_SQL_MIN_RANK', () => {
    assert.equal(sqlMinRank({}), 50);
    assert.equal(sqlMinRank({ A_SEARCH_SQL_MIN_RANK: '120' }), 120);
    assert.equal(sqlMinRank({ A_SEARCH_SQL_MIN_RANK: '-1' }), 50);
  });

  it('buildSelectSql filters ft.RANK >= @minRank', () => {
    const sql = buildSelectSql(0);
    assert.match(sql, /ft\.\[RANK\]\s*>=\s*@minRank/i);
  });

  it('defaultQueryParts binds n from maxResults and minRank; stripped q; gates', async () => {
    /** @type {Record<string, unknown>} */
    const inputs = {};
    let sqlText = '';
    const rows = await defaultQueryParts(
      {
        env: 'live',
        queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
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
              async query(text) {
                sqlText = text;
                // Simulate TOP @n; FR #5046 also binds @gateN (admission in SQL).
                const n = Number(inputs.n) || 0;
                return {
                  recordset: Array.from({ length: n }, (_, i) => ({
                    Title: `Volantex Sport Cub row-${i}`,
                    RANK: 100 - i,
                  })),
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
    assert.doesNotMatch(String(inputs.q), /United\s+Kingdom/i);
    assert.doesNotMatch(String(inputs.q), /\bGBP\b/i);
    assert.match(sqlText, /@minRank/);
    assert.match(sqlText, /@gate0/);
    assert.ok(Object.keys(inputs).some((k) => /^gate\d+$/.test(k)));
    assert.equal(rows.length, 10);
  });

  it('docs mention strip location/currency, maxResults, min RANK (FR #5041)', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5041|#5041/);
    assert.match(text, /maxResults/i);
    assert.match(text, /min(?:imum)?\s*RANK|A_SEARCH_SQL_MIN_RANK/i);
    assert.match(text, /location|currency/i);
  });

  it(
    'optional local: VOLANTEXRC returns 0 rows (FR #5046 exact gate; no stock)',
    {
      skip:
        process.env.A_SEARCH_SQL_INTEGRATION === '1'
          ? false
          : 'set A_SEARCH_SQL_INTEGRATION=1',
    },
    async () => {
      const rows = await defaultQueryParts(
        {
          env: 'live',
          queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
        },
        { env: process.env },
      );
      // FR #5046: no Volantex/Sport Cub/761-14 stock => empty, not junk
      assert.equal(rows.length, 0);
    },
  );
});

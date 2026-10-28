'use strict';

/**
 * FR #5024: FREETEXTTABLE + NVarChar(4000) + quoted phrase excludes.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildFreetextQuery,
  quoteExcludePhrase,
  excludeTermsFromMsg,
  buildSelectSql,
  bindNVarChar,
  FT_NVARCHAR_LEN,
  defaultQueryParts,
} = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

const NINETEEN_EXCLUDES = [
  'club membership',
  'IC',
  'calendar',
  'kit requiring assembly',
  'fuel',
  'nitro',
  'membership card',
  'event ticket',
  'gift voucher',
  'clothing',
  'hat',
  'mug',
  'sticker pack',
  'book only',
  'DVD',
  'poster',
  'T shirt',
  'lanyard',
  'pin badge',
];

function captureQuery(msg) {
  /** @type {Record<string, unknown>} */
  const inputs = {};
  /** @type {Record<string, unknown>} */
  const types = {};
  let sqlText = '';
  return defaultQueryParts(msg, {
    env: {
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_USER: 'a_search_drain',
      A_SEARCH_SQL_TOP: '25',
    },
    sqlTypes: {
      NVarChar: (n) => ({ kind: 'NVarChar', length: n }),
      Int: 'Int',
    },
    connect: async () => ({
      request() {
        return {
          input(name, type, value) {
            inputs[name] = value;
            types[name] = type;
            return this;
          },
          async query(text) {
            sqlText = text;
            return { recordset: [] };
          },
        };
      },
      close() {},
    }),
  }).then(() => ({ inputs, types, sqlText }));
}

describe('FR #5024 FREETEXT + phrase excludes', () => {
  it('VOLANTEXRC query + 19 excludes: FREETEXT @q, NVarChar(4000), phrase @exN', async () => {
    assert.equal(NINETEEN_EXCLUDES.length, 19);
    const { inputs, types, sqlText } = await captureQuery({
      env: 'live',
      queries: [ANNOTATOR_Q],
      exclude: NINETEEN_EXCLUDES,
    });
    // FR #5041: location/currency stripped before FREETEXT
    assert.match(String(inputs.q), /VOLANTEXRC/i);
    assert.doesNotMatch(String(inputs.q), /United\s+Kingdom/i);
    assert.doesNotMatch(String(inputs.q), /\bGBP\b/i);
    assert.doesNotMatch(String(inputs.q), / AND /);
    assert.equal(types.q.kind, 'NVarChar');
    assert.equal(types.q.length, 4000);
    assert.equal(types.env.length, 4000);
    assert.equal(inputs.n, 25);
    assert.equal(inputs.top, 25);
    assert.equal(inputs.minRank, 0);
    assert.match(sqlText, /FREETEXTTABLE\s*\(\s*dbo\.Parts/);
    assert.match(sqlText, /@q,\s*@top/);
    assert.doesNotMatch(sqlText, /CONTAINSTABLE/);
    // FR #5046: exact brand/model CONTAINS gates admit; FREETEXT only orders
    assert.match(sqlText, /CONTAINS\(\(p\.Title, p\.Description\), @gate0\)/);
    assert.ok(Object.keys(inputs).some((k) => /^gate\d+$/.test(k)));
    assert.equal(inputs.ex0, '"club membership"');
    assert.equal(inputs.ex1, '"IC"');
    assert.match(sqlText, /AND NOT CONTAINS\(\(p\.Title, p\.Description\), @ex0\)/);
    assert.match(sqlText, /@ex18/);
    assert.doesNotMatch(sqlText, /nvarchar\(max\)/i);
  });

  it('multi-word exclude stays one quoted phrase', () => {
    assert.equal(quoteExcludePhrase('club membership'), '"club membership"');
    assert.equal(
      excludeTermsFromMsg({ exclude: ['club membership', 'IC'] }).join('|'),
      'club membership|IC',
    );
  });

  it('short exclude IC is kept', () => {
    assert.ok(excludeTermsFromMsg({ exclude: ['IC'] }).includes('IC'));
    assert.equal(quoteExcludePhrase('IC'), '"IC"');
  });

  it('all-noise query returns 0 without connecting', async () => {
    let connected = false;
    const rows = await defaultQueryParts(
      { env: 'live', queries: ['the and or of a'] },
      {
        env: { MSSQL_SERVER: 'walrus\\ASEARCH', MSSQL_DATABASE: 'a_search' },
        connect: async () => {
          connected = true;
          return { request() {}, close() {} };
        },
      },
    );
    assert.deepEqual(rows, []);
    assert.equal(connected, false);
    assert.equal(buildFreetextQuery({ queries: ['the and or'] }), '');
  });

  it('buildSelectSql adds one NOT CONTAINS per exclude; bindNVarChar is 4000', () => {
    const sql = buildSelectSql(2);
    assert.match(sql, /@ex0/);
    assert.match(sql, /@ex1/);
    assert.equal(FT_NVARCHAR_LEN, 4000);
    const typed = bindNVarChar({ NVarChar: (n) => n }, 4000);
    assert.equal(typed, 4000);
  });

  it(
    'optional local: bare servo has no brand/model gate => 0 rows (FR #5046)',
    { skip: process.env.A_SEARCH_SQL_INTEGRATION === '1' ? false : 'set A_SEARCH_SQL_INTEGRATION=1' },
    async () => {
      const rows = await defaultQueryParts(
        { env: 'live', queries: ['servo'] },
        { env: process.env },
      );
      // FREETEXT alone must not admit; no gate tokens => empty
      assert.equal(rows.length, 0);
    },
  );

  it('docs name FREETEXTTABLE and NVarChar(4000)', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FREETEXTTABLE/);
    assert.match(text, /NVarChar\(4000\)/);
    assert.match(text, /FR #5024/);
  });
});

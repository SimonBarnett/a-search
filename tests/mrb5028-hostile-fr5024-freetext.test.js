'use strict';

/**
 * MRB #5028 / FR #5024: hostile pins for FREETEXTTABLE, NVarChar(4000),
 * and quoted phrase excludes (including short IC).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildFreetextQuery,
  quoteExcludePhrase,
  buildSelectSql,
  FT_NVARCHAR_LEN,
  defaultQueryParts,
} = require('../providers/local/sql/src/queryParts');

const ROOT = path.join(__dirname, '..');
const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

describe('MRB #5028 hostile FR #5024 FREETEXT', () => {
  it('SELECT uses FREETEXTTABLE @q @top and never CONTAINSTABLE', () => {
    const sql = buildSelectSql(2);
    assert.match(sql, /FREETEXTTABLE\s*\(\s*dbo\.Parts/i);
    assert.match(sql, /@q,\s*@top/);
    assert.doesNotMatch(sql, /CONTAINSTABLE/i);
    assert.match(sql, /AND NOT CONTAINS\(\(p\.Title, p\.Description\), @ex0\)/);
    assert.match(sql, /AND NOT CONTAINS\(\(p\.Title, p\.Description\), @ex1\)/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|MERGE)\b/i);
  });

  it('binds NVarChar(4000) for q and phrase excludes keep multi-word + IC', async () => {
    assert.equal(FT_NVARCHAR_LEN, 4000);
    assert.equal(quoteExcludePhrase('club membership'), '"club membership"');
    assert.equal(quoteExcludePhrase('IC'), '"IC"');
    assert.equal(buildFreetextQuery({ queries: [ANNOTATOR_Q] }), ANNOTATOR_Q);

    /** @type {Record<string, unknown>} */
    const types = {};
    /** @type {Record<string, unknown>} */
    const inputs = {};
    await defaultQueryParts(
      {
        env: 'live',
        queries: [ANNOTATOR_Q],
        exclude: ['club membership', 'IC'],
      },
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
              input(name, type, value) {
                types[name] = type;
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
    assert.equal(types.q.kind, 'NVarChar');
    assert.equal(types.q.length, 4000);
    assert.equal(types.ex0.length, 4000);
    assert.equal(inputs.ex0, '"club membership"');
    assert.equal(inputs.ex1, '"IC"');
    assert.doesNotMatch(String(inputs.q), / AND /);
  });

  it('docs pin FREETEXTTABLE grant and NVarChar(4000)', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FREETEXTTABLE/);
    assert.match(text, /NVarChar\(4000\)|nvarchar\(4000\)/i);
    assert.match(text, /GRANT SELECT ON dbo\.Parts/);
    assert.doesNotMatch(text, /\bGRANT\s+(INSERT|UPDATE|DELETE)\b/i);
  });
});

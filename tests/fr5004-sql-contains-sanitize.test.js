'use strict';

/**
 * FR #5004: sanitise CONTAINS terms; noise-word info is 0 rows; log SQL fields.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  quoteContainsTerm,
  buildContainsQuery,
  defaultQueryParts,
  isInformationalSqlError,
  formatSqlQueryError,
} = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

describe('FR #5004 CONTAINS sanitise', () => {
  it('annotator query becomes quoted terms without punctuation or operators', () => {
    const q = buildContainsQuery({ queries: [ANNOTATOR_Q] });
    assert.match(q, /"VOLANTEXRC"/);
    assert.match(q, /"Sport"/);
    assert.match(q, /"Cub"/);
    assert.match(q, /"761"/);
    assert.match(q, /"14"/);
    assert.match(q, /"3CH"/);
    assert.match(q, /"Xpilot"/);
    assert.match(q, /"Lathom"/);
    assert.match(q, /"Ormskirk"/);
    assert.match(q, /"L40"/);
    assert.match(q, /"4BA"/);
    assert.match(q, /"co\.uk"/);
    assert.match(q, /"GBP"/);
    assert.equal(/\(|\)|,|;/.test(q), false);
    assert.doesNotMatch(q, /\bAND NOT\b/);
    assert.match(q, / AND /);
    assert.doesNotMatch(q, /"the"/i);
  });

  it('all-noise query yields empty CONTAINS (no SELECT)', () => {
    assert.equal(quoteContainsTerm('the and or of a an'), '');
    assert.equal(buildContainsQuery({ queries: ['the', 'and or'] }), '');
  });

  it('punctuation-heavy input drops operators and empty tokens', () => {
    assert.equal(quoteContainsTerm('!!! ;;; ---'), '');
    const q = buildContainsQuery({
      queries: ['NEAR FORMSOF (servo)'],
      exclude: ['NOT calendar'],
    });
    assert.equal(q, '"servo" AND NOT "calendar"');
  });

  it('queries stay OR and excludes AND NOT after sanitise', () => {
    assert.equal(
      buildContainsQuery({
        queries: [{ q: 'model aircraft' }, 'servo'],
        exclude: [{ match: 'title:calendar' }],
      }),
      '"model" AND "aircraft" OR "servo" AND NOT "calendar"',
    );
  });
});

describe('FR #5004 informational vs real SQL errors', () => {
  it('severity < 11 and noise-word EREQUEST are informational', () => {
    const info = {
      code: 'EREQUEST',
      message: 'Informational: The full-text search condition contained noise word(s).',
      originalError: {
        info: {
          class: 10,
          number: 7619,
          message: 'The full-text search condition contained noise word(s).',
        },
      },
    };
    assert.equal(isInformationalSqlError(info), true);

    const hard = {
      code: 'EREQUEST',
      message: 'Incorrect syntax',
      number: 102,
      originalError: {
        info: { class: 15, number: 102, message: 'Incorrect syntax near.' },
      },
    };
    assert.equal(isInformationalSqlError(hard), false);
  });

  it('informational query error returns [] and does not throw', async () => {
    const rows = await defaultQueryParts(
      { env: 'live', queries: ['servo'] },
      {
        env: {
          MSSQL_SERVER: 'walrus\\ASEARCH',
          MSSQL_DATABASE: 'a_search',
          MSSQL_USER: 'a_search_drain',
        },
        sqlTypes: { NVarChar: 'NVarChar', Int: 'Int' },
        connect: async () => ({
          request() {
            return {
              input() {
                return this;
              },
              async query() {
                const err = new Error(
                  'Informational: The full-text search condition contained noise word(s).',
                );
                err.code = 'EREQUEST';
                err.originalError = {
                  info: { class: 10, number: 7619, message: 'noise word(s)' },
                };
                throw err;
              },
            };
          },
          close() {},
        }),
      },
    );
    assert.deepEqual(rows, []);
  });

  it('real SQL error includes number, message, and sanitised contains', async () => {
    let thrown;
    try {
      await defaultQueryParts(
        { env: 'live', queries: ['servo'] },
        {
          env: {
            MSSQL_SERVER: 'walrus\\ASEARCH',
            MSSQL_DATABASE: 'a_search',
            MSSQL_USER: 'a_search_drain',
          },
          sqlTypes: { NVarChar: 'NVarChar', Int: 'Int' },
          connect: async () => ({
            request() {
              return {
                input() {
                  return this;
                },
                async query() {
                  const err = new Error('Incorrect syntax near.');
                  err.code = 'EREQUEST';
                  err.originalError = {
                    info: { class: 15, number: 102, message: 'Incorrect syntax near.' },
                  };
                  throw err;
                },
              };
            },
            close() {},
          }),
        },
      );
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown);
    assert.equal(thrown.code, 'sql_query_failed');
    assert.equal(thrown.sqlNumber, 102);
    assert.match(String(thrown.sqlMessage), /Incorrect syntax/);
    assert.equal(thrown.containsQuery, '"servo"');
    assert.match(String(thrown.message), /102/);
    const line = formatSqlQueryError(thrown, thrown.containsQuery);
    assert.match(String(line), /102/);
    assert.match(String(line), /Incorrect syntax/);
    assert.match(String(line), /"servo"/);
    assert.doesNotMatch(String(line), /^EREQUEST$/);
  });
});

describe('FR #5004 docs grant', () => {
  it('walrus drain docs name SELECT grant for a-search-drain', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /GRANT SELECT ON dbo\.Parts/);
    assert.match(text, /WONDERLAND\\a-search-drain/);
    assert.match(text, /CONTAINSTABLE/);
    assert.match(text, /FR #5004/);
    assert.doesNotMatch(text, /\bGRANT\s+(INSERT|UPDATE|DELETE)\b/i);
  });
});

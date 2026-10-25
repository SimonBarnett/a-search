'use strict';

/**
 * MRB #5005 / FR #5004: hostile pins for CONTAINS sanitise, informational
 * 0-row path, drain log line, and parameterized @contains.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildContainsQuery,
  SELECT_SQL,
  isInformationalSqlError,
  formatSqlQueryError,
} = require('../providers/local/sql/src/queryParts');

const ROOT = path.join(__dirname, '..');
const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

describe('MRB #5005 hostile FR #5004 CONTAINS', () => {
  it('SELECT_SQL binds @q only (never concatenates user text)', () => {
    assert.match(SELECT_SQL, /FREETEXTTABLE[\s\S]*@q/i);
    assert.doesNotMatch(SELECT_SQL, /\b(INSERT|UPDATE|DELETE|MERGE)\b/i);
    const src = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'sql', 'src', 'queryParts.js'),
      'utf8',
    );
    assert.match(src, /\.input\(\s*['"]q['"]/);
    assert.match(src, /NVarChar\(4000\)|FT_NVARCHAR_LEN|bindNVarChar/);
  });

  it('annotator fixture query is FREETEXT natural language', () => {
    const q = buildContainsQuery({ queries: [ANNOTATOR_Q] });
    assert.match(q, /VOLANTEXRC/);
    assert.match(q, /761-14/);
    assert.doesNotMatch(q, /"VOLANTEXRC" AND/);
  });

  it('drainRunner logs sql_query_failed message not bare EREQUEST', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'walrus', 'src', 'drainRunner.js'),
      'utf8',
    );
    assert.match(text, /sql_query_failed/);
    assert.match(text, /err\.message/);
  });

  it('formatSqlQueryError embeds number message and contains', () => {
    const err = {
      code: 'EREQUEST',
      message: 'Incorrect syntax near.',
      originalError: {
        info: { class: 15, number: 102, message: 'Incorrect syntax near.' },
      },
    };
    assert.equal(isInformationalSqlError(err), false);
    const line = String(formatSqlQueryError(err, '"servo"'));
    assert.match(line, /102/);
    assert.match(line, /Incorrect syntax/);
    assert.match(line, /"servo"/);
    assert.doesNotMatch(line, /^EREQUEST$/);
  });

  it('docs pin SELECT-only grant for WONDERLAND\\a-search-drain', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /GRANT SELECT ON dbo\.Parts/);
    assert.match(text, /WONDERLAND\\a-search-drain/);
    assert.match(text, /FR #5004/);
    assert.doesNotMatch(text, /\bGRANT\s+(INSERT|UPDATE|DELETE)\b/i);
  });
});

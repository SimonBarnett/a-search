'use strict';

/**
 * MRB #5042 / FR #5041: hostile pins --- strip location/currency,
 * honour maxResults, min RANK.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const QP = path.join(ROOT, 'providers', 'local', 'sql', 'src', 'queryParts.js');
const DOCS = path.join(ROOT, 'docs', 'walrus-sql-drain.md');

describe('MRB #5042 hostile FR #5041 strip/maxResults/minRank', () => {
  it('queryParts exports strip and min-rank helpers', () => {
    const src = fs.readFileSync(QP, 'utf8');
    assert.match(src, /function stripAnnotatorLocationCurrency/);
    assert.match(src, /DEFAULT_SQL_MIN_RANK\s*=\s*50/);
    assert.match(src, /A_SEARCH_SQL_MIN_RANK/);
    assert.match(src, /ft\.\[RANK\]\s*>=\s*@minRank/);
    assert.match(src, /resolveSqlRowLimit|maxResults/);
    // FR #5046: exact gate still required alongside FR #5041 ordering
    assert.match(src, /function extractBrandModelGateTokens/);
    assert.match(src, /@gate/);
  });

  it('docs pin FR #5041 strip, maxResults, min RANK', () => {
    const text = fs.readFileSync(DOCS, 'utf8');
    assert.match(text, /FR #5041|#5041/);
    assert.match(text, /maxResults/i);
    assert.match(text, /A_SEARCH_SQL_MIN_RANK|min(?:imum)?\s*RANK/i);
    assert.match(text, /location|currency/i);
    assert.equal(text.charCodeAt(0) === 0xfeff, false);
  });
});

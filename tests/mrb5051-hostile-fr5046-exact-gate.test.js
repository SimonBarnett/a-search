'use strict';

/**
 * MRB #5051 / FR #5046: hostile pins --- exact brand/model CONTAINS gate;
 * FREETEXT orders only; zero gate => no SELECT.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const QP = path.join(ROOT, 'providers', 'local', 'sql', 'src', 'queryParts.js');
const DOCS = path.join(ROOT, 'docs', 'walrus-sql-drain.md');

describe('MRB #5051 hostile FR #5046 exact brand/model gate', () => {
  it('queryParts admits only via extractBrandModelGateTokens CONTAINS ORs', () => {
    const src = fs.readFileSync(QP, 'utf8');
    assert.match(src, /function extractBrandModelGateTokens/);
    assert.match(src, /GATE_GENERIC_WORDS/);
    assert.match(src, /sql_empty_brand_model_gate_no_select/);
    assert.match(src, /CONTAINS\(\(\$\{FT_PARTS_CONTAINS_COLS\}\), @gate/);
    assert.match(src, /FREETEXTTABLE/);
    assert.match(src, /ft\.\[RANK\]\s*>=\s*@minRank/);
    // Contiguous: FREETEXT only orders gated rows
    assert.match(
      src,
      /FREETEXT only orders rows that already passed the FR #5046 exact-token gate/,
    );
    assert.match(src, /never admit via FREETEXT alone/);
  });

  it('docs pin Simon rule + heuristic + empty without FREETEXT-only', () => {
    const text = fs.readFileSync(DOCS, 'utf8');
    assert.match(text, /FR #5046|#5046/);
    assert.match(text, /exact brand or model token/i);
    assert.match(text, /orders.*gate|never admits/i);
    assert.match(text, /need more vendors|no results|Relevance beats/i);
    assert.match(text, /volantex\*/i);
    assert.match(text, /extractBrandModelGateTokens/);
    assert.match(text, /zero.*gate|without\s+querying|never FREETEXT-only/i);
    assert.equal(text.charCodeAt(0) === 0xfeff, false);
  });
});

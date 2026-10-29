'use strict';

/**
 * docs/mrb-5291: hostile pins for FR #5287 quiet searchid reclean.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { cleanSearchesQueries } = require('../redqueen/src/guidSearch');

describe('docs/mrb-5291 hostile FR #5287', () => {
  it('cleanSearchesQueries strips United Kingdom GBP contiguous', () => {
    const rows = cleanSearchesQueries(
      [{ q: 'kits United Kingdom GBP', intent: 'page', maxResults: 10 }],
      'GB',
      'GBP',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].q, 'kits');
  });

  it('guidSearch.js pins quiet searchid rewrite without POST', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'redqueen', 'src', 'guidSearch.js'),
      'utf8',
    );
    assert.match(src, /FR #5287/);
    assert.match(src, /searchesQueriesNeedClean/);
    assert.match(src, /cleaned:\s*true/);
    assert.match(src, /function cleanSearchesQueries/);
  });

  it('cleanSearchesQueries keeps brand/model/sku after stripping UK/GBP', () => {
    const rows = cleanSearchesQueries(
      [
        {
          q: 'VOLANTEXRC Sport Cub 761-14 United Kingdom GBP',
          intent: 'page',
          maxResults: 10,
          brand: 'VOLANTEXRC',
          model: 'Sport Cub S2',
          sku: '761-14',
        },
      ],
      'GB',
      'GBP',
    );
    assert.equal(rows.length, 1);
    assert.doesNotMatch(rows[0].q, /United Kingdom/i);
    assert.doesNotMatch(rows[0].q, /\bGBP\b/);
    assert.equal(rows[0].sku, '761-14');
    assert.equal(rows[0].brand, 'VOLANTEXRC');
    assert.equal(rows[0].model, 'Sport Cub S2');
  });

  it('docs pin FR #5287 in redqueen-annotations', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(text, /FR #5287/);
    assert.match(text, /keywordsOnly/);
  });
});
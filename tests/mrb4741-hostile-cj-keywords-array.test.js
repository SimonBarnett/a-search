'use strict';

/**
 * MRB #4741 hostile: FR #4740 keywords must stay [String!]! — fr041.hostile-mrb280
 * must not regress to String! / bare string variables.keywords.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildProductsQuery } = require('../providers/live/cj/src/search');

describe('MRB #4741 hostile: CJ keywords [String!]!', () => {
  it('buildProductsQuery never declares $keywords: String!', () => {
    const q = buildProductsQuery('shoes', 'CID-99', 'web-test');
    assert.match(q.query, /\$keywords:\s*\[String!\]!/);
    assert.doesNotMatch(q.query, /\$keywords:\s*String!/);
    assert.deepEqual(q.variables.keywords, ['shoes']);
  });

  it('fr041.hostile-mrb280 pin expects array keywords', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'fr041.hostile-mrb280.test.js'),
      'utf8',
    );
    assert.match(src, /deepEqual\s*\(\s*q\.variables\.keywords\s*,\s*\[\s*['"]shoes['"]\s*\]\s*\)/);
    assert.doesNotMatch(src, /assert\.equal\s*\(\s*q\.variables\.keywords\s*,\s*['"]shoes['"]\s*\)/);
  });
});

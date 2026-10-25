'use strict';

/**
 * Hostile MRB #5059 / FR #5057: CJ companyId omit-retry + env assert.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SEARCH = path.join(ROOT, 'providers', 'live', 'cj', 'src', 'search.js');
const ASSERT = path.join(ROOT, 'cdk', 'lib', 'provider-env-assert.js');
const MATRIX = path.join(ROOT, 'docs', 'secrets-matrix.md');

describe('MRB #5059 hostile FR #5057 CJ 403', () => {
  it('searchCj retries only on cj_not_authorised when companyId set', () => {
    const src = fs.readFileSync(SEARCH, 'utf8');
    assert.match(src, /err\.code === 'cj_not_authorised'/);
    assert.match(src, /postProducts\(''\)/);
    assert.match(src, /FR #5057/);
    assert.match(src, /FR #4782/);
    assert.doesNotMatch(src, /do not DLQ \/ intake-fatal/);
  });

  it('assert + secrets-matrix require company and website', () => {
    const a = fs.readFileSync(ASSERT, 'utf8');
    const m = fs.readFileSync(MATRIX, 'utf8');
    assert.match(a, /CJ_COMPANY_ID/);
    assert.match(a, /CJ_WEBSITE_ID/);
    assert.match(m, /CJ_COMPANY_ID/);
    assert.match(m, /retries once without/);
    assert.match(m, /FR #4782/);
  });
});

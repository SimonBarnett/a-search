'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cj = path.join(__dirname, '..', 'providers', 'live', 'cj');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-cj', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-019 cj provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(cj, rel);
      assert.ok(fs.existsSync(p), `missing ${path.join('providers/live/cj', rel)}`);
    }
  });

  it('skill mentions ads.api.cj.com', () => {
    const text = fs.readFileSync(
      path.join(cj, '.grok', 'skills', 'a-search-cj', 'SKILL.md'),
      'utf8',
    );
    assert.match(text, /ads\.api\.cj\.com/i);
  });

  it('exports run() with GraphQL search path (not scaffold stub)', async () => {
    const { run } = require('../providers/live/cj/src/worker');
    assert.equal(typeof run, 'function');
    const fixture = JSON.parse(
      fs.readFileSync(path.join(cj, 'fixtures', 'products-ok.json'), 'utf8'),
    );
    const out = await run(
      {
        searchId: 'srch_cj',
        userId: 'U1',
        env: 'sandbox',
        source: 'cj',
        q: 'laptop',
        catalogId: 1,
        category: 'Electronics',
        subcategory: 'Computers',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          CJ_API_TOKEN: 't',
          CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
          S3_RESULTS_BUCKET: 'b',
        },
        httpRequest: async () => fixture,
        putObject: async () => ({ ETag: '"1"' }),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.source, 'cj');
    assert.ok(Array.isArray(out.products));
    assert.ok(out.products.length >= 1);
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
  });
});

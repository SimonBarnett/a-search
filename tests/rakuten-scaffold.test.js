'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rakuten = path.join(__dirname, '..', 'providers', 'live', 'rakuten');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-rakuten', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-018 rakuten provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(rakuten, rel);
      assert.ok(
        fs.existsSync(p),
        `missing ${path.join('providers/live/rakuten', rel)}`,
      );
    }
  });

  it('skill notes XML + rate limits', () => {
    const text = fs.readFileSync(
      path.join(rakuten, '.grok', 'skills', 'a-search-rakuten', 'SKILL.md'),
      'utf8',
    );
    assert.match(text, /XML/i);
    assert.match(text, /rate\s*limit/i);
  });

  it('exports run() with Product Search path (not scaffold stub)', async () => {
    const { run } = require('../providers/live/rakuten/src/worker');
    assert.equal(typeof run, 'function');
    const fixture = fs.readFileSync(
      path.join(rakuten, 'fixtures', 'product-search-ok.xml'),
      'utf8',
    );
    const out = await run(
      {
        searchId: 'srch_rak',
        userId: 'U1',
        env: 'sandbox',
        source: 'rakuten',
        q: 'shoes',
        catalogId: 1,
        category: 'Fashion',
        subcategory: 'Shoes',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          RAKUTEN_APPLICATION_KEY: 'k',
          S3_RESULTS_BUCKET: 'b',
        },
        httpRequest: async () => ({ statusCode: 200, headers: {}, body: fixture }),
        putObject: async () => ({ ETag: '"1"' }),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.source, 'rakuten');
    assert.ok(Array.isArray(out.products));
    assert.ok(out.products.length >= 1);
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
  });
});

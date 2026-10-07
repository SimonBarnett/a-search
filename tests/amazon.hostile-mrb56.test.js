'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const amazon = path.join(__dirname, '..', 'providers', 'live', 'amazon');

describe('MRB #56 hostile: FR-016 amazon scaffold', () => {
  it('paths exist; run(msg) callable', async () => {
    assert.ok(fs.existsSync(path.join(amazon, 'AGENTS.md')));
    assert.ok(
      fs.existsSync(path.join(amazon, '.grok', 'skills', 'a-search-amazon', 'SKILL.md'))
    );
    const { run } = require('../providers/live/amazon/src/worker');
    const out = await run(
      {
        searchId: 'srch_h',
        userId: 'U1',
        env: 'sandbox',
        source: 'amazon',
        q: 'x',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          AMAZON_ACCESS_KEY: 'AKIATEST',
          AMAZON_SECRET_KEY: 'secret',
          AMAZON_PARTNER_TAG: 'tag-20',
          S3_RESULTS_BUCKET: 'b',
        },
        searchAmazon: async () => [],
        putObject: async () => ({}),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.source, 'amazon');
  });

  it('.env.example keeps Amazon secrets in provider env only', () => {
    const text = fs.readFileSync(path.join(amazon, '.env.example'), 'utf8');
    assert.match(text, /AMAZON_/);
    assert.match(text, /A_SEARCH_ENV/);
    const entryEnv = fs.readFileSync(
      path.join(__dirname, '..', 'entry', '.env.example'),
      'utf8'
    );
    assert.doesNotMatch(entryEnv, /AMAZON_SECRET_KEY/);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cj = path.join(__dirname, '..', 'providers', 'live', 'cj');

describe('MRB #67 hostile: FR-019 cj scaffold', () => {
  it('paths exist; skill pins ads.api.cj.com; run(msg) callable', async () => {
    assert.ok(fs.existsSync(path.join(cj, 'AGENTS.md')));
    const skill = path.join(cj, '.grok', 'skills', 'a-search-cj', 'SKILL.md');
    assert.ok(fs.existsSync(skill));
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /ads\.api\.cj\.com/i);
    assert.match(text, /GraphQL/i);
    const { run } = require('../providers/live/cj/src/worker');
    const fixture = JSON.parse(
      fs.readFileSync(path.join(cj, 'fixtures', 'products-ok.json'), 'utf8'),
    );
    const out = await run(
      {
        searchId: 'srch_h67',
        userId: 'U1',
        env: 'sandbox',
        source: 'cj',
        q: 'x',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          CJ_API_TOKEN: 't',
          S3_RESULTS_BUCKET: 'b',
        },
        httpRequest: async () => fixture,
        putObject: async () => ({ ETag: '"1"' }),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.source, 'cj');
  });

  it('.env.example keeps CJ secrets in provider env only', () => {
    const text = fs.readFileSync(path.join(cj, '.env.example'), 'utf8');
    assert.match(text, /CJ_API_TOKEN/);
    assert.match(text, /CJ_GRAPHQL_URL/);
    assert.match(text, /ads\.api\.cj\.com/);
    assert.match(text, /A_SEARCH_ENV/);
    const entryEnv = fs.readFileSync(
      path.join(__dirname, '..', 'entry', '.env.example'),
      'utf8',
    );
    assert.doesNotMatch(entryEnv, /CJ_API_TOKEN/);
  });
});
'use strict';

/** FR-041: CJ GraphQL Product Search client + fixtures */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'cj',
  'fixtures',
  'products-ok.json',
);
const { run, CjCredsError } = require('../providers/live/cj/src/worker');
const { resultsKey } = require('../shared/resultsPath');

const baseMsg = {
  searchId: 'srch_cj_41',
  userId: 'U-CJ',
  env: 'sandbox',
  source: 'cj',
  q: 'laptop',
  catalogId: 42,
  category: 'Electronics',
  subcategory: 'Computers',
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  CJ_API_TOKEN: 'token-test',
  CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-041 cj GraphQL Product Search client', () => {
  it('fixture GraphQL HTTP â†’ normalize products â†’ S3 put called', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const puts = [];
    const httpCalls = [];

    const out = await run(baseMsg, {
      env: credEnv,
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.equal(req.method, 'POST');
        assert.match(req.url, /ads\.api\.cj\.com/);
        assert.match(req.headers.Authorization, /^Bearer /);
        assert.match(req.body, /ProductSearch|products/);
        return fixture;
      },
      putObject: async (args) => {
        puts.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'cj');
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'cj-fix-001');
    assert.equal(out.products[0].title, 'Fixture Ultrabook Laptop');
    assert.equal(out.products[0].price, 899);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(out.products[0].source, 'cj');
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
    assert.equal(httpCalls.length, 1);
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'cj',
        userId: 'U-CJ',
        catalogId: 42,
        searchId: 'srch_cj_41',
      }),
    );
  });

  it('missing CJ token â†’ clear cj_missing_credentials error', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: { A_SEARCH_ENV: 'sandbox', S3_RESULTS_BUCKET: 'b' },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof CjCredsError || err.code === 'cj_missing_credentials',
        );
        assert.match(String(err.message), /CJ_API_TOKEN|credentials missing/i);
        return true;
      },
    );
  });

  it('fail-when: stub-only message is gone', () => {
    const workerSrc = fs.readFileSync(
      path.join(__dirname, '..', 'providers', 'live', 'cj', 'src', 'worker.js'),
      'utf8',
    );
    assert.match(workerSrc, /searchCj|writeResults/);
    assert.doesNotMatch(
      workerSrc,
      /GraphQL client for ads\.api\.cj\.com not wired yet/,
    );
    assert.ok(
      fs.existsSync(
        path.join(__dirname, '..', 'providers', 'live', 'cj', 'src', 'search.js'),
      ),
    );
  });
});

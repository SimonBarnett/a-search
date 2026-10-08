'use strict';

/**
 * FR-069: skimlinks worker wires search → normalize → writeResults (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'skimlinks',
  'fixtures',
  'products-ok.json',
);
const { assertProductSchema } = require('../worker/lib/normalizeProduct');
const { resultsKey } = require('../shared/resultsPath');
const { EnvIsolationError } = require('../shared/assertEnv');

const baseMsg = {
  searchId: 'srch_sk_69',
  userId: 'U-SK',
  env: 'sandbox',
  source: 'skimlinks',
  q: 'laptop',
  catalogId: 42,
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  SKIMLINKS_API_KEY: 'fixture-key',
  SKIMLINKS_COUNTRY: 'uk',
  SKIMLINKS_PUBLISHER_ID: 'pub-test',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-069 skimlinks worker search→normalize→writeResults', () => {
  it('fixture path writes results via injected putObject; no stub message', async () => {
    const { run } = require('../providers/live/skimlinks/src/worker');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const puts = [];

    const out = await run(baseMsg, {
      env: credEnv,
      httpRequest: async () => fixture,
      putObject: async (args) => {
        puts.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'skimlinks');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'sk-fix-001');
    assert.equal(out.products[0].title, 'Fixture Ultrabook Laptop');
    assert.equal(out.products[0].source, 'skimlinks');
    assert.equal(out.products[0].price, 899);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(out.products[0].description, 'Fixture Merchant A');
    assertProductSchema(out.products[0]);
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'skimlinks',
        userId: 'U-SK',
        catalogId: 42,
        searchId: 'srch_sk_69',
      }),
    );
  });

  it('wrong-env message refused via assertEnv before HTTP', async () => {
    const { run } = require('../providers/live/skimlinks/src/worker');
    await assert.rejects(
      () =>
        run(
          { ...baseMsg, env: 'live' },
          {
            env: { ...credEnv, A_SEARCH_ENV: 'sandbox' },
            httpRequest: async () => {
              throw new Error('should not call HTTP');
            },
            putObject: async () => {
              throw new Error('should not put');
            },
          },
        ),
      (err) =>
        err instanceof EnvIsolationError ||
        err.name === 'EnvIsolationError' ||
        err.code === 'env_mismatch',
    );
  });

  it('normalize(fixture) passes assertProductSchema; empty products ok', () => {
    const {
      normalizeSearchResponse,
    } = require('../providers/live/skimlinks/src/normalize');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const products = normalizeSearchResponse(fixture, {
      userId: 'U-SK',
      env: 'sandbox',
      envVars: credEnv,
    });
    assert.equal(products.length, 2);
    for (const p of products) assertProductSchema(p);

    assert.deepEqual(
      normalizeSearchResponse(
        { skimlinksProductAPI: { products: [] } },
        { userId: 'U-SK', env: 'sandbox', envVars: credEnv },
      ),
      [],
    );
    assert.deepEqual(
      normalizeSearchResponse(
        {},
        { userId: 'U-SK', env: 'sandbox', envVars: credEnv },
      ),
      [],
    );
  });

  it('registry keeps skimlinks enabled false for both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const sk = registry.sources.find((s) => s.id === 'skimlinks');
    assert.ok(sk);
    assert.equal(sk.enabled.live, false);
    assert.equal(sk.enabled.sandbox, false);
  });

  it('worker source no longer contains not-wired stub message', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'live', 'skimlinks', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /searchSkimlinks|writeResults/);
    assert.match(src, /normalizeSearchResponse|normalize/);
  });
});

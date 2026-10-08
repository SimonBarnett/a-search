'use strict';

/**
 * FR-077: etsy worker wires search → normalize → writeResults (stay-dark).
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
  'etsy',
  'fixtures',
  'listings-ok.json',
);
const { assertProductSchema } = require('../worker/lib/normalizeProduct');
const { resultsKey } = require('../shared/resultsPath');
const { EnvIsolationError } = require('../shared/assertEnv');

const baseMsg = {
  searchId: 'srch_et_77',
  userId: 'U-ET',
  env: 'sandbox',
  source: 'etsy',
  q: 'mug',
  catalogId: 42,
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  ETSY_API_KEY: 'fixture-key',
  ETSY_TRACKING_ID: 'track-test',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-077 etsy worker search→normalize→writeResults', () => {
  it('fixture path writes results via injected putObject; no stub message', async () => {
    const { run } = require('../providers/live/etsy/src/worker');
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
    assert.equal(out.source, 'etsy');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, '10001');
    assert.equal(out.products[0].title, 'Fixture Handmade Ceramic Mug');
    assert.equal(out.products[0].source, 'etsy');
    assert.equal(out.products[0].price, 18.5);
    assert.equal(out.products[0].currency, 'GBP');
    assertProductSchema(out.products[0]);
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'etsy',
        userId: 'U-ET',
        catalogId: 42,
        searchId: 'srch_et_77',
      }),
    );
  });

  it('wrong-env message refused via assertEnv before HTTP', async () => {
    const { run } = require('../providers/live/etsy/src/worker');
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

  it('registry keeps etsy enabled false for both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.ok(et);
    assert.equal(et.enabled.live, false);
    assert.equal(et.enabled.sandbox, false);
  });

  it('worker source no longer contains not-wired stub message', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'live', 'etsy', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /searchEtsy|writeResults/);
    assert.match(src, /normalizeSearchResponse|normalize/);
  });
});

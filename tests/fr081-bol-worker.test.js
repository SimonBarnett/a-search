'use strict';

/**
 * FR-081: bol worker wires search → normalize → writeResults (enabled FR-171).
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
  'bol',
  'fixtures',
  'products-ok.json',
);
const { assertProductSchema } = require('../worker/lib/normalizeProduct');
const { resultsKey } = require('../shared/resultsPath');
const { EnvIsolationError } = require('../shared/assertEnv');

const baseMsg = {
  searchId: 'srch_bol_81',
  userId: 'U-BOL',
  env: 'sandbox',
  source: 'bol',
  q: 'earbuds',
  catalogId: 42,
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  BOL_API_KEY: 'fixture-key',
  BOL_TRACKING_ID: 'track-test',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-081 bol worker search→normalize→writeResults', () => {
  it('fixture path writes results via injected putObject; no stub message', async () => {
    const { run } = require('../providers/live/bol/src/worker');
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
    assert.equal(out.source, 'bol');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'bol-fix-001');
    assert.equal(out.products[0].title, 'Fixture Wireless Earbuds NL');
    assert.equal(out.products[0].source, 'bol');
    assert.equal(out.products[0].price, 19.99);
    assert.equal(out.products[0].currency, 'EUR');
    assertProductSchema(out.products[0]);
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'bol',
        userId: 'U-BOL',
        catalogId: 42,
        searchId: 'srch_bol_81',
      }),
    );
  });

  it('wrong-env message refused via assertEnv before HTTP', async () => {
    const { run } = require('../providers/live/bol/src/worker');
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

  it('registry keeps bol enabled true for both envs (FR-171)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.ok(bol);
    assert.equal(bol.enabled.live, true);
    assert.equal(bol.enabled.sandbox, true);
  });

  it('worker source no longer contains not-wired stub message', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'live', 'bol', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /searchBol|writeResults/);
    assert.match(src, /normalizeSearchResponse|normalize/);
  });
});

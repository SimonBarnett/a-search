'use strict';

/**
 * FR #4038: live provider workers write a-clubs IN/ + backoff429 (follow-up to #4030/#4035).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const {
  validateInResult,
  inResultKey,
  IN_SOURCES,
} = require('../shared/search/inResultSchema');
const { backoffFor429 } = require('../shared/search/backoff429');
const { writeInResultToS3 } = require('../shared/search/writeInResultS3');
const {
  writeLiveProviderInResult,
  resolveAClubsBucket,
} = require('../shared/search/writeLiveProviderInResult');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');

// FR #4451: skimlinks is local affiliate (SQL), not an AWS live worker.
const LIVE = [
  'amazon',
  'ebay',
  'etsy',
  'aliexpress',
  'bol',
  'cj',
  'kelkoo',
  'rakuten',
];

describe('FR #4038 shared IN schema + write', () => {
  it('IN_SOURCES includes live providers wired by this FR', () => {
    for (const s of LIVE) {
      assert.ok(IN_SOURCES.includes(s), `missing ${s}`);
    }
  });

  it('key is host/guid/IN/{searchid}-{source}.json', () => {
    assert.equal(
      inResultKey({
        hostkey: 'shop.example',
        guid: 'guid-1',
        searchid: 'srch_1',
        source: 'amazon',
      }),
      'shop.example/guid-1/IN/srch_1-amazon.json',
    );
  });

  it('writeInResultToS3 validates body and calls touchLastmod for guid + host', async () => {
    /** @type {string[]} */
    const keys = [];
    /** @type {string[]} */
    const touched = [];
    const putObject = async (args) => {
      keys.push(args.Key);
      const raw = JSON.parse(Buffer.from(args.Body).toString('utf8'));
      const v = validateInResult(raw);
      assert.equal(v.ok, true);
    };
    const touchLastmod = async (opts) => {
      touched.push(opts.Key);
    };
    await writeInResultToS3({
      hostkey: 'shop.example',
      guid: 'g1',
      searchid: 's1',
      source: 'ebay',
      products: [{ id: 'p1' }],
      putObject,
      touchLastmod,
    });
    assert.equal(keys[0], 'shop.example/g1/IN/s1-ebay.json');
    assert.deepEqual(touched, ['shop.example/g1/', 'shop.example/']);
  });

  it('writeLiveProviderInResult maps msg fields and binds A_CLUBS_BUCKET', async () => {
    /** @type {object[]} */
    const puts = [];
    const out = await writeLiveProviderInResult({
      msg: {
        hostkey: 'h.example',
        guid: 'wg',
        searchid: 'sid',
        queries: ['q'],
      },
      source: 'etsy',
      products: [{ sku: '1' }],
      envVars: { A_CLUBS_BUCKET: 'a-clubs-test' },
      putObject: async (args) => {
        puts.push(args);
      },
      touchLastmod: async () => {},
    });
    assert.equal(out.bucket, 'a-clubs-test');
    assert.equal(out.key, 'h.example/wg/IN/sid-etsy.json');
    assert.equal(puts[0].Bucket, 'a-clubs-test');
    assert.equal(puts[0].Key, out.key);
    assert.equal(resolveAClubsBucket({}), 'a-clubs');
  });

  it('legacy msg without hostkey/guid falls back to writeResults', async () => {
    const puts = [];
    const out = await writeLiveProviderInResult({
      msg: {
        env: 'live',
        userId: '1',
        catalogId: '2',
        searchId: 'x',
      },
      source: 'amazon',
      products: [{ id: 'p' }],
      envVars: { S3_RESULTS_BUCKET: 'results-test' },
      putObject: async (args) => {
        puts.push(args);
      },
    });
    assert.equal(out.legacyResults, true);
    assert.equal(out.bucket, 'results-test');
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'results-test');
  });
});

describe('FR #4038 429 backoff', () => {
  it('backoffFor429 reads Retry-After and caps at 900', () => {
    const b = backoffFor429({
      err: { status: 429 },
      retryAfter: '45',
    });
    assert.equal(b.is429, true);
    assert.equal(b.visibilityTimeout, 45);
    assert.equal(b.reason, 'http_429_backoff');
    const cap = backoffFor429({ err: { statusCode: 429 }, retryAfter: '9999' });
    assert.equal(cap.visibilityTimeout, 900);
  });

  it('handleSqsWith429 ChangeMessageVisibility then rethrows (never swallows 429)', async () => {
    /** @type {object[]} */
    const vis = [];
    const err429 = Object.assign(new Error('throttled'), { status: 429 });
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({
                  hostkey: 'h',
                  guid: 'g',
                  searchid: 's',
                }),
                receiptHandle: 'rh-1',
              },
            ],
          },
          run: async () => {
            throw err429;
          },
          changeMessageVisibility: async (args) => {
            vis.push(args);
          },
        }),
      /throttled/,
    );
    assert.equal(vis.length, 1);
    assert.equal(vis[0].ReceiptHandle, 'rh-1');
    assert.ok(vis[0].VisibilityTimeout >= 1);
  });
});

describe('FR #4038 live worker wiring pins', () => {
  it('each live worker requires writeLiveProviderInResult (not writeResults)', () => {
    for (const name of LIVE) {
      const p = path.join(root, 'providers', 'live', name, 'src', 'worker.js');
      const src = fs.readFileSync(p, 'utf8');
      assert.match(src, /writeLiveProviderInResult/);
      assert.doesNotMatch(src, /require\(['"][^'"]*shared\/writeResults['"]\)/);
    }
  });

  it('handlers use handleSqsWith429 (amazon handler.js or inline)', () => {
    for (const name of LIVE) {
      const handlerPath = path.join(
        root,
        'providers',
        'live',
        name,
        'src',
        'handler.js',
      );
      const workerPath = path.join(
        root,
        'providers',
        'live',
        name,
        'src',
        'worker.js',
      );
      const src = fs.existsSync(handlerPath)
        ? fs.readFileSync(handlerPath, 'utf8')
        : fs.readFileSync(workerPath, 'utf8');
      assert.match(src, /handleSqsWith429/, name);
    }
  });

  it('amazon run writes IN/ key via injected putObject', async () => {
    const { run } = require('../providers/live/amazon/src/worker.js');
    /** @type {object[]} */
    const puts = [];
    const out = await run(
      {
        env: 'live',
        hostkey: 'shop.example',
        guid: 'guid-amz',
        searchid: 'srch_amz',
        searchId: 'srch_amz',
        userId: 'u1',
        catalogId: 'c1',
      },
      {
        env: {
          A_SEARCH_ENV: 'live',
          A_CLUBS_BUCKET: 'a-clubs',
          AMAZON_SEARCH_API: 'paapi',
          AMAZON_ACCESS_KEY: 'FAKE_AK',
          AMAZON_SECRET_KEY: 'FAKE_SK',
          AMAZON_PARTNER_TAG: 'FAKE_TAG',
        },
        searchAmazon: async () => [{ id: 'asin1', title: 't' }],
        putObject: async (args) => {
          puts.push(args);
        },
        touchLastmod: async () => {},
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.key, 'shop.example/guid-amz/IN/srch_amz-amazon.json');
    assert.equal(puts[0].Key, out.key);
    assert.equal(puts[0].Bucket, 'a-clubs');
    const body = JSON.parse(Buffer.from(puts[0].Body).toString('utf8'));
    assert.equal(validateInResult(body).ok, true);
  });

  it('shared package.json files includes search/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('search/'));
  });

  it('stack wires live workers A_CLUBS_BUCKET + a-clubs read/write', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /function wireAclubsInAccess/);
    assert.match(stack, /wireAclubsInAccess\(worker,\s*aClubsBucket\)/);
    assert.match(stack, /A_CLUBS_BUCKET/);
  });
});

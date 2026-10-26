'use strict';

/**
 * FR #4823: live providers and SQL drain write a-clubs IN/ only when products.length >= 1.
 * Zero products = log provider_done products=0, no IN, no DLQ. Failures still DLQ (#4769).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeLiveProviderInResult,
} = require('../shared/search/writeLiveProviderInResult');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');
const { runDrainJob } = require('../walrus/src/runJob');
const { pagePartsAclubs } = require('../parts-gateway/src/pageParts');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { buildInResult, inResultKey } = require('../shared/search/inResultSchema');
const { run: runAmazon } = require('../providers/live/amazon/src/worker');
const { run: runEbay } = require('../providers/live/ebay/src/worker');
const { run: runRakuten } = require('../providers/live/rakuten/src/worker');
const { run: runCj } = require('../providers/live/cj/src/worker');
const { run: runKelkoo } = require('../providers/live/kelkoo/src/worker');
const { run: runEtsy } = require('../providers/live/etsy/src/worker');
const { run: runEbayWorker } = require('../providers/live/ebay/src/worker');
const { run: runRakutenWorker } = require('../providers/live/rakuten/src/worker');

const ROOT = path.join(__dirname, '..');
const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const HOST = 'www.mymodelflyingclub.co.uk';

const ACLUBS_MSG = {
  hostkey: HOST,
  guid: GUID,
  searchid: 'srch_4823_empty',
  env: 'sandbox',
  source: 'cj',
};

const creatorsEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  AMAZON_SEARCH_API: 'creators',
  AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
  AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
  AMAZON_CREATORS_CREDENTIAL: 'FAKE_creators_cred',
  AMAZON_CREATORS_MARKETPLACE: 'www.amazon.co.uk',
  AMAZON_PARTNER_TAG: 'fake-tag-21',
};

const ebayEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  EBAY_CLIENT_ID: 'FAKE_ebay_id',
  EBAY_CLIENT_SECRET: 'FAKE_ebay_secret',
  EBAY_MARKETPLACE_ID: 'EBAY_GB',
};

const rakutenEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
};

const cjEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  CJ_API_TOKEN: 'FAKE_cj_token',
  CJ_WEBSITE_ID: '12345',
};

const kelkooEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  KELKOO_API_KEY: 'fixture-token',
  KELKOO_COUNTRY: 'uk',
  KELKOO_PUBLISHER_ID: 'pub-test',
};

const etsyEnv = {
  A_SEARCH_ENV: 'sandbox',
  A_CLUBS_BUCKET: 'test-a-clubs',
  ETSY_API_KEY: 'FAKE_etsy_key',
  ETSY_SHARED_SECRET: 'FAKE_etsy_secret',
};

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a-clubs-4823-'));
}

/**
 * @param {() => Promise<unknown>} fn
 */
async function withCapturedLog(fn) {
  /** @type {string[]} */
  const logs = [];
  const orig = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const result = await fn();
    return { logs, result };
  } finally {
    console.log = orig;
  }
}

function minimalProduct(id) {
  return {
    id: id || 'p1',
    title: 'Fixture part',
    url: 'https://example.test/p/1',
    price: 9.99,
    currency: 'GBP',
    source: 'test',
  };
}

describe('FR #4823 writeLiveProviderInResult', () => {
  it('skips IN put at 0 products, writes _search-done/, and logs provider_done (FR #5198)', async () => {
    const puts = [];
    const { logs, result } = await withCapturedLog(() =>
      writeLiveProviderInResult({
        msg: ACLUBS_MSG,
        source: 'cj',
        products: [],
        envVars: { A_CLUBS_BUCKET: 'a-clubs-test' },
        putObject: async (args) => {
          puts.push(args);
        },
        touchLastmod: async () => {},
      }),
    );
    assert.equal(result.skipped, 'no_products');
    assert.equal(result.key, null);
    const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
    const donePuts = puts.filter((p) => String(p.Key || '').startsWith('_search-done/'));
    assert.equal(inPuts.length, 0);
    assert.ok(donePuts.length >= 1);
    assert.equal(
      puts.some((p) => /\/DONE\//i.test(String(p.Key || ''))),
      false,
    );
    assert.ok(logs.some((l) => /provider_done/.test(l) && /products=0/.test(l)));
    assert.ok(logs.some((l) => /\bsource=cj\b/.test(l)));
    assert.ok(logs.some((l) => /srch_4823_empty/.test(l)));
  });

  it('writes IN when products.length >= 1', async () => {
    const puts = [];
    const out = await writeLiveProviderInResult({
      msg: ACLUBS_MSG,
      source: 'ebay',
      products: [minimalProduct()],
      envVars: { A_CLUBS_BUCKET: 'a-clubs-test' },
      putObject: async (args) => {
        puts.push(args);
      },
      touchLastmod: async () => {},
    });
    assert.equal(out.skipped, undefined);
    assert.match(out.key, /IN\/srch_4823_empty-ebay\.json$/);
    const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
    assert.equal(inPuts.length, 1);
  });
});

describe('FR #4823 live workers zero products', () => {
  const cases = [
    {
      name: 'amazon',
      run: runAmazon,
      env: creatorsEnv,
      inject: { searchAmazonCreators: async () => [] },
    },
    {
      name: 'ebay',
      run: runEbay,
      env: ebayEnv,
      inject: { searchEbay: async () => [] },
    },
    {
      name: 'rakuten',
      run: runRakuten,
      env: rakutenEnv,
      inject: { searchRakuten: async () => [] },
    },
    {
      name: 'cj',
      run: runCj,
      env: cjEnv,
      inject: { searchCj: async () => [] },
    },
    {
      name: 'kelkoo',
      run: runKelkoo,
      env: kelkooEnv,
      inject: {
        searchKelkoo: async () => ({ offers: [] }),
        normalizeSearchResponse: () => [],
      },
    },
    {
      name: 'etsy',
      run: runEtsy,
      env: etsyEnv,
      inject: {
        searchEtsy: async () => ({ results: [] }),
        normalizeSearchResponse: () => [],
      },
    },
  ];

  for (const c of cases) {
    it(`${c.name}: 0 products -> no IN put, DONE ok, key null, provider_done log (FR #4917)`, async () => {
      const puts = [];
      const msg = { ...ACLUBS_MSG, source: c.name, searchId: ACLUBS_MSG.searchid };
      const { logs, result } = await withCapturedLog(() =>
        c.run(msg, {
          env: c.env,
          putObject: async (args) => {
            puts.push(args);
            return {};
          },
          touchLastmod: async () => {},
          ...c.inject,
        }),
      );
      assert.equal(result.ok, true);
      assert.deepEqual(result.products, []);
      assert.equal(result.key, null);
      const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
      assert.equal(inPuts.length, 0);
      assert.ok(logs.some((l) => /provider_done/.test(l) && /products=0/.test(l)));
    });
  }

  it('ebay worker with products writes exactly one IN key', async () => {
    const puts = [];
    const msg = { ...ACLUBS_MSG, source: 'ebay', searchId: ACLUBS_MSG.searchid };
    const out = await runEbayWorker(msg, {
      env: ebayEnv,
      searchEbay: async () => [minimalProduct('ebay-1')],
      putObject: async (args) => {
        puts.push(args);
        return {};
      },
      touchLastmod: async () => {},
    });
    assert.equal(out.ok, true);
    assert.equal(out.products.length, 1);
    const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
    assert.equal(inPuts.length, 1);
    assert.match(inPuts[0].Key, /IN\/srch_4823_empty-ebay\.json$/);
  });

  it('rakuten worker with products writes IN (FR #4781 search [] still no IN at worker)', async () => {
    const puts = [];
    const msg = { ...ACLUBS_MSG, source: 'rakuten', searchId: ACLUBS_MSG.searchid };
    const outEmpty = await runRakutenWorker(msg, {
      env: rakutenEnv,
      searchRakuten: async () => [],
      putObject: async (args) => {
        puts.push(args);
        return {};
      },
      touchLastmod: async () => {},
    });
    assert.equal(outEmpty.key, null);
    assert.equal(
      puts.filter((p) => /\/IN\//i.test(String(p.Key || ''))).length,
      0,
    );

    puts.length = 0;
    const outHit = await runRakutenWorker(msg, {
      env: rakutenEnv,
      searchRakuten: async () => [minimalProduct('rk-1')],
      putObject: async (args) => {
        puts.push(args);
        return {};
      },
      touchLastmod: async () => {},
    });
    assert.equal(outHit.products.length, 1);
    assert.equal(
      puts.filter((p) => /\/IN\//i.test(String(p.Key || ''))).length,
      1,
    );
  });
});

describe('FR #4823 walrus runDrainJob + pageParts', () => {
  it('runDrainJob with sql worker 0 rows writes no IN file', async () => {
    const root = tmpRoot();
    const searchid = 'srch_sql_empty';
    await runDrainJob(
      {
        source: 'sql',
        searchid,
        host: HOST,
        hostkey: HOST,
        guid: GUID,
        widgetGuid: GUID,
        env: 'live',
      },
      {
        aClubsRoot: root,
        repoRoot: ROOT,
        envVars: {
          MSSQL_DATABASE: 'a_search',
          A_SEARCH_ENV: 'live',
          A_CLUBS_ROOT: root,
        },
        queryParts: async () => [],
        touchLastmod: async () => {},
      },
    );
    const key = inResultKey({
      hostkey: HOST,
      guid: GUID,
      searchid,
      source: 'sql',
    });
    const abs = path.join(root, key.replace(/\//g, path.sep));
    assert.equal(fs.existsSync(abs), false);
  });

  it('pagePartsAclubs stays searching when IN/ has files but enabled=0 (FR #4891)', async () => {
    const s3 = createMemoryS3();
    const mintFixed = (bytes) => () =>
      require('../shared/identity/madeiraUserId').mintChecksummedUserId({
        randomBytes: () => Buffer.from(bytes),
      });
    const pageEmpty = await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([1, 1, 1, 1, 1, 1, 1]),
    });
    assert.equal(pageEmpty.status, 'searching');
    assert.equal(pageEmpty.enabled, 0);
    assert.equal(pageEmpty.init, 0);

    const body = buildInResult({
      searchid: 'srch_promo',
      source: 'ebay',
      hostkey: HOST,
      guid: GUID,
      products: [minimalProduct('widget-1')],
    });
    const inKey = inResultKey({
      hostkey: HOST,
      guid: GUID,
      searchid: 'srch_promo',
      source: 'ebay',
    });
    s3.objects.set(inKey, {
      Body: Buffer.from(JSON.stringify(body, null, 2), 'utf8'),
      Metadata: {},
    });
    const pagePromo = await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    // /parts must not promote; still searching until promoteInToLive sets enabled.
    assert.equal(pagePromo.status, 'searching');
    assert.equal(pagePromo.enabled, 0);
    assert.equal(pagePromo.init, 0);
  });
});

describe('FR #4823 failures unchanged (DLQ, no IN)', () => {
  it('provider fault still throws without IN write', async () => {
    const puts = [];
    const err = new Error('CJ HTTP 403');
    err.code = 'cj_not_authorised';
    err.nonRetryable = true;
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ ...ACLUBS_MSG, source: 'cj' }),
                receiptHandle: 'rh-f',
              },
            ],
          },
          run: async () => {
            throw err;
          },
          deps: {
            putObject: async (args) => {
              puts.push(args);
            },
            touchLastmod: async () => {},
          },
          logError: () => {},
          source: 'cj',
        }),
      (e) => e === err,
    );
    // Immediate DLQ without queue URLs throws; no IN. (DONE needs SQS move path.)
    assert.equal(
      puts.filter((p) => /\/IN\//i.test(String(p.Key || ''))).length,
      0,
    );
  });
});

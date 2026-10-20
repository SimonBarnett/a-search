'use strict';

/**
 * FR #4428: handler(event, lambdaContext) must not throw putObject_required.
 * Default S3 is stubbed at the SDK client. Injected putObject still wins.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');

const PROVIDERS = [
  {
    id: 'aliexpress',
    worker: 'providers/live/aliexpress/src/worker.js',
    env: { ALIEXPRESS_API_KEY: 'EXAMPLE_KEY' },
  },
  {
    id: 'amazon',
    worker: 'providers/live/amazon/src/worker.js',
    env: {
      AMAZON_SEARCH_API: 'paapi',
      AMAZON_ACCESS_KEY: 'EXAMPLE_KEY',
      AMAZON_SECRET_KEY: 'EXAMPLE_SECRET',
      AMAZON_PARTNER_TAG: 'EXAMPLE_TAG',
    },
  },
  {
    id: 'bol',
    worker: 'providers/live/bol/src/worker.js',
    env: { BOL_API_KEY: 'EXAMPLE_KEY' },
  },
  {
    id: 'cj',
    worker: 'providers/live/cj/src/worker.js',
    env: { CJ_API_TOKEN: 'EXAMPLE_TOKEN' },
  },
  {
    id: 'ebay',
    worker: 'providers/live/ebay/src/worker.js',
    env: {
      EBAY_CLIENT_ID: 'EXAMPLE_ID',
      EBAY_CLIENT_SECRET: 'EXAMPLE_SECRET',
    },
  },
  {
    id: 'etsy',
    worker: 'providers/live/etsy/src/worker.js',
    env: { ETSY_API_KEY: 'EXAMPLE_KEY:EXAMPLE_SECRET' },
  },
  {
    id: 'kelkoo',
    worker: 'providers/live/kelkoo/src/worker.js',
    env: { KELKOO_API_KEY: 'EXAMPLE_KEY' },
  },
  {
    id: 'rakuten',
    worker: 'providers/live/rakuten/src/worker.js',
    env: {
      RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
      RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
      RAKUTEN_SID: 'FAKE_sid',
    },
  },
  {
    id: 'skimlinks',
    worker: 'providers/local/skimlinks/src/worker.js',
    env: { SKIMLINKS_API_KEY: 'EXAMPLE_KEY' },
  },
];

function lambdaContext() {
  return {
    awsRequestId: 'req-fr4428',
    functionName: 'a-search-worker-live',
    invokedFunctionArn: 'arn:aws:lambda:eu-west-1:000000000000:function:worker',
    getRemainingTimeInMillis: () => 30000,
  };
}

function agentMsg() {
  return {
    env: 'sandbox',
    hostkey: 'www.example.test',
    guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
    searchid: 'srch_fr4428',
    userId: 'user-example',
    q: 'plane',
  };
}

function stubSdk() {
  const sdkPath = require.resolve('@aws-sdk/client-s3');
  const sdk = require(sdkPath);
  const orig = sdk.S3Client;
  const sends = [];
  sdk.S3Client = class FakeS3Client {
    send(cmd) {
      const name = cmd && cmd.constructor ? cmd.constructor.name : '';
      const input = cmd && cmd.input ? cmd.input : cmd;
      sends.push({ name, input });
      if (name === 'HeadObjectCommand') return { Metadata: {} };
      if (name === 'GetObjectCommand') {
        return { Body: Buffer.alloc(0), Metadata: {} };
      }
      if (name === 'GetObjectTaggingCommand') return { TagSet: [] };
      return {};
    }
  };
  return {
    sends,
    restore() {
      sdk.S3Client = orig;
    },
  };
}

function stubSearch(workerRel) {
  const searchPath = require.resolve(
    path.join(root, workerRel.replace(/worker\.js$/, 'search.js')),
  );
  const real = require(searchPath);
  const stub = { ...real };
  for (const key of Object.keys(real)) {
    if (typeof real[key] === 'function' && key.startsWith('search')) {
      stub[key] = async () => ({});
    }
  }
  require.cache[searchPath].exports = stub;
  return () => {
    require.cache[searchPath].exports = real;
  };
}

function loadWorker(workerRel) {
  const workerPath = require.resolve(path.join(root, workerRel));
  delete require.cache[workerPath];
  if (workerRel.includes('amazon')) {
    const handlerPath = require.resolve(
      path.join(root, 'providers/live/amazon/src/handler.js'),
    );
    delete require.cache[handlerPath];
  }
  return require(workerPath);
}

describe('FR #4428 live workers default S3 from Lambda context', () => {
  /** @type {{ sends: { name: string, input: object }[], restore: Function }} */
  let sdk;
  const saved = {};

  before(() => {
    for (const key of [
      'A_SEARCH_ENV',
      'A_CLUBS_BUCKET',
      'ALIEXPRESS_API_KEY',
      'AMAZON_ACCESS_KEY',
      'AMAZON_SECRET_KEY',
      'AMAZON_PARTNER_TAG',
      'BOL_API_KEY',
      'CJ_API_TOKEN',
      'EBAY_CLIENT_ID',
      'EBAY_CLIENT_SECRET',
      'ETSY_API_KEY',
      'KELKOO_API_KEY',
      'RAKUTEN_CLIENT_ID',
      'RAKUTEN_CLIENT_SECRET',
      'RAKUTEN_SID',
      'SKIMLINKS_API_KEY',
    ]) {
      saved[key] = process.env[key];
    }
    process.env.A_SEARCH_ENV = 'sandbox';
    process.env.A_CLUBS_BUCKET = 'a-clubs';
  });

  after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  for (const provider of PROVIDERS) {
    it(provider.id + ' handler(event, context) puts IN/ without putObject_required', async () => {
      Object.assign(process.env, provider.env);
      const restoreSearch = stubSearch(provider.worker);
      const { handler } = loadWorker(provider.worker);
      sdk = stubSdk();
      try {
        const result = await handler(
          { Records: [{ body: JSON.stringify(agentMsg()) }] },
          lambdaContext(),
        );
        assert.equal(result.ok, true);
        const puts = sdk.sends.filter((s) => s.name === 'PutObjectCommand');
        assert.ok(puts.length >= 1, provider.id + ' must PutObject');
        const inPut = puts.find(
          (s) => s.input && String(s.input.Key || '').includes('/IN/'),
        );
        assert.ok(inPut, provider.id + ' IN key missing: ' + JSON.stringify(puts));
        assert.match(String(inPut.input.Key), /\/IN\/srch_fr4428-/);
      } finally {
        sdk.restore();
        restoreSearch();
      }
    });
  }

  it('ebay keeps an injected putObject and does not construct S3Client', async () => {
    Object.assign(process.env, {
      EBAY_CLIENT_ID: 'EXAMPLE_ID',
      EBAY_CLIENT_SECRET: 'EXAMPLE_SECRET',
    });
    const puts = [];
    const { handler } = loadWorker('providers/live/ebay/src/worker.js');
    let constructed = 0;
    const sdkPath = require.resolve('@aws-sdk/client-s3');
    const sdk = require(sdkPath);
    const orig = sdk.S3Client;
    sdk.S3Client = class {
      constructor() {
        constructed += 1;
      }
      send() {
        throw new Error('sdk send should not run');
      }
    };
    try {
      const result = await handler(
        { Records: [{ body: JSON.stringify(agentMsg()) }] },
        {
          putObject: async (input) => {
            puts.push(input);
          },
          headObject: async () => ({ Metadata: {} }),
          getObject: async () => ({ Body: Buffer.alloc(0), Metadata: {} }),
          copyObject: async () => ({}),
          getObjectTagging: async () => ({ TagSet: [] }),
          putObjectTagging: async () => ({}),
          searchEbay: async () => [],
        },
      );
      assert.equal(result.ok, true);
      assert.equal(constructed, 0);
      assert.ok(puts.some((p) => String(p.Key || '').includes('/IN/')));
    } finally {
      sdk.S3Client = orig;
    }
  });

  it('ebay handler reports exceptions when Lambda context has no reportException', async () => {
    const calls = [];
    const reportPath = require.resolve(
      path.join(root, 'shared/intake/reportException.js'),
    );
    const real = require(reportPath);
    require.cache[reportPath].exports = {
      ...real,
      reportException: async (info) => {
        calls.push(info);
      },
    };
    const { handler } = loadWorker('providers/live/ebay/src/worker.js');
    try {
      await assert.rejects(
        () =>
          handler(
            { Records: [{ body: 'not-json' }] },
            lambdaContext(),
          ),
        /not valid JSON/,
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'ebay');
    } finally {
      require.cache[reportPath].exports = real;
    }
  });
});

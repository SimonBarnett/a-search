'use strict';

/** FR-054f: mapping live vs sandbox isolation — cross-env get empty */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  upsertMapping,
  getMapping,
  createMemoryMappingStore,
} = require('../shared/mapping/mapping');
const {
  createMemoryS3Objects,
  createS3MappingStore,
  mappingObjectKey,
} = require('../shared/mapping/s3Store');
const { writeResults } = require('../shared/writeResults');
const { resultsKey } = require('../shared/resultsPath');

describe('FR-054f mapping live vs sandbox isolation', () => {
  it('memory store: sandbox get does not see live row (same token)', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'amazon',
        tokenOrClickRef: 'same-token',
        s3Key: 'live/amazon/U1/1/live.json',
      },
      { store },
    );

    const sandbox = await getMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'amazon',
        token: 'same-token',
      },
      { store },
    );
    assert.equal(sandbox, null);

    const live = await getMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'amazon',
        token: 'same-token',
      },
      { store },
    );
    assert.ok(live);
    assert.equal(live.env, 'live');
    assert.equal(live.s3Key, 'live/amazon/U1/1/live.json');
  });

  it('memory store: live get does not see sandbox row', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'awin',
        token: 'tok_sb',
        s3Key: 'sandbox/awin/U1/1/sb.json',
      },
      { store },
    );
    const live = await getMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'awin',
        tokenOrClickRef: 'tok_sb',
      },
      { store },
    );
    assert.equal(live, null);
  });

  it('S3 store: cross-env get empty; both envs can coexist', async () => {
    const backend = createMemoryS3Objects();
    const store = createS3MappingStore({
      bucket: 'iso-bucket',
      putObject: backend.putObject,
      getObject: backend.getObject,
    });

    await upsertMapping(
      {
        env: 'live',
        userId: 'FROM_JWT',
        source: 'ebay',
        tokenOrClickRef: 'clk_x',
        s3Key: 'live/ebay/FROM_JWT/1/a.json',
      },
      { store },
    );
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'FROM_JWT',
        source: 'ebay',
        tokenOrClickRef: 'clk_x',
        s3Key: 'sandbox/ebay/FROM_JWT/1/b.json',
      },
      { store },
    );

    const live = await getMapping(
      {
        env: 'live',
        userId: 'FROM_JWT',
        source: 'ebay',
        token: 'clk_x',
      },
      { store },
    );
    const sandbox = await getMapping(
      {
        env: 'sandbox',
        userId: 'FROM_JWT',
        source: 'ebay',
        token: 'clk_x',
      },
      { store },
    );
    assert.ok(live);
    assert.ok(sandbox);
    assert.equal(live.s3Key, 'live/ebay/FROM_JWT/1/a.json');
    assert.equal(sandbox.s3Key, 'sandbox/ebay/FROM_JWT/1/b.json');
    assert.notEqual(live.s3Key, sandbox.s3Key);

    const liveKey = mappingObjectKey({
      env: 'live',
      userId: 'FROM_JWT',
      source: 'ebay',
      tokenOrClickRef: 'clk_x',
    });
    const sbKey = mappingObjectKey({
      env: 'sandbox',
      userId: 'FROM_JWT',
      source: 'ebay',
      tokenOrClickRef: 'clk_x',
    });
    assert.notEqual(liveKey, sbKey);
    assert.match(liveKey, /^live\/_mapping\//);
    assert.match(sbKey, /^sandbox\/_mapping\//);
  });

  it('writeResults mapping registration stays in request env', async () => {
    const backend = createMemoryS3Objects();
    const bucket = 'wr-iso';
    const mappingStore = createS3MappingStore({
      bucket,
      putObject: backend.putObject,
      getObject: backend.getObject,
    });
    const job = {
      env: 'sandbox',
      source: 'amazon',
      userId: 'U9',
      catalogId: 3,
      searchId: 'srch_iso',
      tokenOrClickRef: 'clk_iso',
    };

    await writeResults({
      ...job,
      envVars: { S3_RESULTS_BUCKET: bucket },
      putObject: backend.putObject,
      getObject: backend.getObject,
      mappingStore,
    });

    const sandbox = await getMapping(
      {
        env: 'sandbox',
        userId: 'U9',
        source: 'amazon',
        token: 'clk_iso',
      },
      { store: mappingStore },
    );
    assert.ok(sandbox);
    assert.equal(sandbox.env, 'sandbox');
    assert.equal(sandbox.s3Key, resultsKey(job));

    const live = await getMapping(
      {
        env: 'live',
        userId: 'U9',
        source: 'amazon',
        token: 'clk_iso',
      },
      { store: mappingStore },
    );
    assert.equal(live, null);
  });
});

'use strict';

/** FR-054e: listMappingsByUserId — only that userId (+ env) returned */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  upsertMapping,
  listMappingsByUserId,
  createMemoryMappingStore,
  MappingError,
} = require('../shared/mapping/mapping');
const {
  createMemoryS3Objects,
  createS3MappingStore,
} = require('../shared/mapping/s3Store');

describe('FR-054e listMappingsByUserId', () => {
  it('memory store returns only that userId in env', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'live',
        userId: 'FROM_JWT',
        source: 'amazon',
        token: 't1',
        s3Key: 'live/amazon/FROM_JWT/1/a.json',
      },
      { store },
    );
    await upsertMapping(
      {
        env: 'live',
        userId: 'FROM_JWT',
        source: 'awin',
        token: 't2',
        s3Key: 'live/awin/FROM_JWT/1/b.json',
      },
      { store },
    );
    await upsertMapping(
      {
        env: 'live',
        userId: 'OTHER',
        source: 'amazon',
        token: 't3',
        s3Key: 'live/amazon/OTHER/1/c.json',
      },
      { store },
    );
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'FROM_JWT',
        source: 'amazon',
        token: 't4',
        s3Key: 'sandbox/amazon/FROM_JWT/1/d.json',
      },
      { store },
    );

    const rows = await listMappingsByUserId(
      { env: 'live', userId: 'FROM_JWT' },
      { store },
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.userId === 'FROM_JWT'));
    assert.ok(rows.every((r) => r.env === 'live'));
    assert.ok(!rows.some((r) => r.userId === 'OTHER'));
    assert.ok(!rows.some((r) => r.env === 'sandbox'));
  });

  it('optional source filter narrows list', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'amazon',
        token: 'a',
        s3Key: 'live/amazon/U1/1/a.json',
      },
      { store },
    );
    await upsertMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'ebay',
        token: 'b',
        s3Key: 'live/ebay/U1/1/b.json',
      },
      { store },
    );
    const rows = await listMappingsByUserId(
      { env: 'live', userId: 'U1', source: 'amazon' },
      { store },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'amazon');
  });

  it('S3 store listByUserId returns only that userId', async () => {
    const backend = createMemoryS3Objects();
    const store = createS3MappingStore({
      bucket: 'list-bucket',
      putObject: backend.putObject,
      getObject: backend.getObject,
      listObjectsV2: backend.listObjectsV2,
    });
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'impact',
        tokenOrClickRef: 'clk_1',
        s3Key: 'sandbox/impact/U1/1/x.json',
      },
      { store },
    );
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'U2',
        source: 'impact',
        tokenOrClickRef: 'clk_2',
        s3Key: 'sandbox/impact/U2/1/y.json',
      },
      { store },
    );

    const rows = await listMappingsByUserId(
      { env: 'sandbox', userId: 'U1' },
      { store },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, 'U1');
    assert.equal(rows[0].tokenOrClickRef, 'clk_1');
  });

  it('rejects bad env / missing userId', async () => {
    const store = createMemoryMappingStore();
    await assert.rejects(
      () => listMappingsByUserId({ env: 'prod', userId: 'U' }, { store }),
      (err) => err instanceof MappingError && err.code === 'mapping_bad_env',
    );
    await assert.rejects(
      () => listMappingsByUserId({ env: 'live', userId: '' }, { store }),
      (err) => err instanceof MappingError && err.code === 'mapping_missing_userId',
    );
  });
});

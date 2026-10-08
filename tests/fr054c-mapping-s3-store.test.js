'use strict';

/** FR-054c: durable S3 mapping store — survives new module instance */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { upsertMapping, getMapping } = require('../shared/mapping/mapping');
const {
  mappingObjectKey,
  tokenHash,
  createMemoryS3Objects,
  createS3MappingStore,
} = require('../shared/mapping/s3Store');

describe('FR-054c mapping durable S3 store', () => {
  it('module lives under shared/mapping/s3Store.js', () => {
    const p = path.join(__dirname, '..', 'shared', 'mapping', 's3Store.js');
    assert.ok(fs.existsSync(p), 'missing shared/mapping/s3Store.js');
  });

  it('mappingObjectKey is {env}/_mapping/{userId}/{source}/{tokenHash}.json', () => {
    const token = 'clk_01JEXAMPLE';
    const key = mappingObjectKey({
      env: 'live',
      userId: 'ABC12345',
      source: 'amazon',
      tokenOrClickRef: token,
    });
    assert.equal(
      key,
      `live/_mapping/ABC12345/amazon/${tokenHash(token)}.json`,
    );
  });

  it('upsert then get via S3 adapter round-trips', async () => {
    const backend = createMemoryS3Objects();
    const store = createS3MappingStore({
      bucket: 'a-search-results-test',
      putObject: backend.putObject,
      getObject: backend.getObject,
    });
    const row = {
      env: 'sandbox',
      userId: 'U1',
      source: 'awin',
      token: 'tok_a',
      s3Key: 'sandbox/awin/U1/1/srch_a.json',
      searchId: 'srch_a',
      createdAt: '2026-10-08T12:00:00.000Z',
    };
    await upsertMapping(row, { store });
    const got = await getMapping(
      { env: 'sandbox', userId: 'U1', source: 'awin', tokenOrClickRef: 'tok_a' },
      { store },
    );
    assert.ok(got);
    assert.equal(got.s3Key, row.s3Key);
    assert.equal(got.searchId, 'srch_a');
    assert.equal(got.tokenOrClickRef, 'tok_a');
  });

  it('survives new store/module instance (not memory-only)', async () => {
    const backend = createMemoryS3Objects();
    const bucket = 'durable-bucket';
    const store1 = createS3MappingStore({
      bucket,
      putObject: backend.putObject,
      getObject: backend.getObject,
    });
    await upsertMapping(
      {
        env: 'live',
        userId: 'JWTUSER1',
        source: 'amazon',
        tokenOrClickRef: 'clk_persist',
        s3Key: 'live/amazon/JWTUSER1/9/srch_p.json',
        meta: { wave: 1 },
      },
      { store: store1 },
    );

    // New adapter instance — no shared JS Map of records; only the S3 backend.
    const store2 = createS3MappingStore({
      bucket,
      putObject: backend.putObject,
      getObject: backend.getObject,
    });
    assert.notEqual(store1, store2);

    const got = await getMapping(
      {
        env: 'live',
        userId: 'JWTUSER1',
        source: 'amazon',
        token: 'clk_persist',
      },
      { store: store2 },
    );
    assert.ok(got, 'second instance must read durable S3 object');
    assert.equal(got.s3Key, 'live/amazon/JWTUSER1/9/srch_p.json');
    assert.equal(got.meta.wave, 1);

    const expectedKey = mappingObjectKey({
      env: 'live',
      userId: 'JWTUSER1',
      source: 'amazon',
      tokenOrClickRef: 'clk_persist',
    });
    assert.ok(
      backend.objects.has(`${bucket}/${expectedKey}`),
      'object must exist in shared S3 backend map',
    );
  });

  it('live and sandbox object keys stay isolated', () => {
    const live = mappingObjectKey({
      env: 'live',
      userId: 'U',
      source: 'amazon',
      token: 'same',
    });
    const sandbox = mappingObjectKey({
      env: 'sandbox',
      userId: 'U',
      source: 'amazon',
      token: 'same',
    });
    assert.notEqual(live, sandbox);
    assert.match(live, /^live\/_mapping\//);
    assert.match(sandbox, /^sandbox\/_mapping\//);
  });

  it('docs/s3-mapping.md locks S3 _mapping store (not MSSQL for 054c)', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 's3-mapping.md'),
      'utf8',
    );
    assert.match(text, /LOCKED/);
    assert.match(text, /_mapping/);
    assert.match(text, /s3Store\.js|createS3MappingStore/);
    assert.match(text, /MSSQL[\s\S]*not[\s\*]*used/i);
  });

  it('createS3MappingStore requires bucket', () => {
    assert.throws(
      () => createS3MappingStore({}),
      (err) => err && err.code === 'mapping_missing_bucket',
    );
  });
});

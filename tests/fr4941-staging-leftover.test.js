'use strict';

/**
 * FR #4941: leftover dbo.PartsStaging must merge or fail loudly;
 * successful merge clears staging; one staging table (dbo).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryStore } = require('../walrus/import/src/memoryStore');
const { createSqlStore } = require('../walrus/import/src/sqlStore');

describe('FR #4941 leftover staging', () => {
  it('endOfRunHealth fails when leftover staging is non-empty', async () => {
    const store = createMemoryStore({ env: 'live' });
    store.leftoverStaging.push({
      Source: 'awin',
      FeedKey: '116097',
      MerchantProductId: 'sku-1',
      Env: 'live',
    });
    assert.throws(
      () => store.endOfRunHealth(),
      (err) => err && err.code === 'staging_leftover',
    );
  });

  it('drainLeftoverStaging merges leftover into Parts then clears staging', async () => {
    const store = createMemoryStore({ env: 'live' });
    store.leftoverStaging.push({
      Source: 'awin',
      FeedKey: '116097',
      MerchantProductId: 'sku-stuck',
      Env: 'live',
      Title: 'Stuck part',
      ContentHash: 'h1',
    });
    const drained = await store.drainLeftoverStaging();
    assert.equal(drained.feeds, 1);
    assert.equal(store.leftoverStaging.length, 0);
    const parts = store.listActive('awin', '116097');
    assert.equal(parts.length, 1);
    assert.equal(parts[0].MerchantProductId, 'sku-stuck');
  });

  it('endOfRunHealth fails when a leftover feed is missing from Parts', async () => {
    const store = createMemoryStore({ env: 'live' });
    store.leftoverStaging.push({
      Source: 'awin',
      FeedKey: '116097',
      MerchantProductId: 'sku-2',
      Env: 'live',
    });
    store.drainLeftoverStaging = async () => ({ feeds: 0 });
    assert.throws(
      () => store.endOfRunHealth(),
      (err) => err && err.code === 'staging_leftover',
    );
  });

  it('sqlStore merge SQL clears dbo.PartsStaging after MERGE (not ingest)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'walrus', 'import', 'src', 'sqlStore.js'),
      'utf8',
    );
    assert.match(src, /DELETE FROM dbo\.PartsStaging/);
    assert.match(src, /INSERT INTO dbo\.PartsStaging/);
    assert.doesNotMatch(src, /INSERT INTO ingest\.PartsStaging/);
    assert.match(src, /FROM dbo\.PartsStaging/);
    const mig = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'migrations', '024_DropIngestPartsStaging.sql'),
      'utf8',
    );
    assert.match(mig, /DROP TABLE ingest\.PartsStaging/i);
  });
});

describe('FR #4941 sql stub leftover', () => {
  it('createSqlStore drainLeftoverStaging is exported', () => {
    const store = createSqlStore({
      env: 'live',
      database: 'a_search_sandbox',
      exec: async () => ({ recordset: [] }),
    });
    assert.equal(typeof store.drainLeftoverStaging, 'function');
  });
});

'use strict';

/** FR-054b: mapping upsert/get API — injectable store round-trip */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MappingError,
  mappingNaturalKey,
  normalizeMapping,
  createMemoryMappingStore,
  upsertMapping,
  getMapping,
} = require('../shared/mapping/mapping');

describe('FR-054b mapping upsert/get', () => {
  it('module lives under shared/mapping/', () => {
    const p = path.join(__dirname, '..', 'shared', 'mapping', 'mapping.js');
    assert.ok(fs.existsSync(p), 'missing shared/mapping/mapping.js');
  });

  it('upsert then get round-trip returns same key fields', async () => {
    const store = createMemoryMappingStore();
    const row = {
      env: 'live',
      userId: 'ABC12345',
      source: 'amazon',
      tokenOrClickRef: 'clk_01',
      s3Key: 'live/amazon/ABC12345/123/srch_01.json',
      searchId: 'srch_01',
      catalogId: '123',
      createdAt: '2026-10-08T12:00:00.000Z',
      meta: { note: 'a' },
    };

    const written = await upsertMapping(row, { store });
    assert.equal(written.env, 'live');
    assert.equal(written.userId, 'ABC12345');
    assert.equal(written.source, 'amazon');
    assert.equal(written.tokenOrClickRef, 'clk_01');
    assert.equal(written.token, 'clk_01');
    assert.equal(written.s3Key, 'live/amazon/ABC12345/123/srch_01.json');
    assert.equal(written.searchId, 'srch_01');
    assert.equal(written.catalogId, '123');
    assert.equal(written.createdAt, '2026-10-08T12:00:00.000Z');
    assert.equal(written.meta.note, 'a');

    const got = await getMapping(
      {
        env: 'live',
        userId: 'ABC12345',
        source: 'amazon',
        token: 'clk_01',
      },
      { store },
    );
    assert.ok(got);
    assert.equal(got.s3Key, row.s3Key);
    assert.equal(got.tokenOrClickRef, 'clk_01');
    assert.equal(got.searchId, 'srch_01');
  });

  it('token alias tokenOrClickRef round-trips', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'awin',
        token: 'tok_x',
        s3Key: 'sandbox/awin/U1/1/srch_x.json',
      },
      { store },
    );
    const got = await getMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'awin',
        tokenOrClickRef: 'tok_x',
      },
      { store },
    );
    assert.ok(got);
    assert.equal(got.s3Key, 'sandbox/awin/U1/1/srch_x.json');
  });

  it('second upsert updates s3Key and keeps createdAt', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'ebay',
        tokenOrClickRef: 't1',
        s3Key: 'live/ebay/U1/1/old.json',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
      { store },
    );
    const updated = await upsertMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'ebay',
        tokenOrClickRef: 't1',
        s3Key: 'live/ebay/U1/1/new.json',
        createdAt: '2026-10-09T00:00:00.000Z',
        meta: { v: 2 },
      },
      { store },
    );
    assert.equal(updated.s3Key, 'live/ebay/U1/1/new.json');
    assert.equal(updated.createdAt, '2026-10-01T00:00:00.000Z');
    assert.equal(updated.meta.v, 2);

    const got = await getMapping(
      { env: 'live', userId: 'U1', source: 'ebay', token: 't1' },
      { store },
    );
    assert.equal(got.s3Key, 'live/ebay/U1/1/new.json');
  });

  it('live get does not see sandbox row (env isolation)', async () => {
    const store = createMemoryMappingStore();
    await upsertMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'amazon',
        token: 'same-token',
        s3Key: 'sandbox/amazon/U1/1/a.json',
      },
      { store },
    );
    const live = await getMapping(
      {
        env: 'live',
        userId: 'U1',
        source: 'amazon',
        token: 'same-token',
      },
      { store },
    );
    assert.equal(live, null);
  });

  it('normalizeMapping rejects missing required fields', () => {
    assert.throws(
      () => normalizeMapping({ env: 'live', userId: 'U', source: 'a' }),
      (err) => err instanceof MappingError && err.code === 'mapping_missing_token',
    );
    assert.throws(
      () =>
        normalizeMapping({
          env: 'prod',
          userId: 'U',
          source: 'a',
          token: 't',
          s3Key: 'k',
        }),
      (err) => err instanceof MappingError && err.code === 'mapping_bad_env',
    );
  });

  it('upsert without injectable store fails closed', async () => {
    await assert.rejects(
      () =>
        upsertMapping({
          env: 'live',
          userId: 'U',
          source: 'a',
          token: 't',
          s3Key: 'k',
        }),
      (err) => err instanceof MappingError && err.code === 'mapping_missing_store',
    );
  });

  it('mappingNaturalKey is stable for same parts', () => {
    const a = mappingNaturalKey({
      env: 'live',
      userId: 'U',
      source: 'amazon',
      tokenOrClickRef: 't',
    });
    const b = mappingNaturalKey({
      env: 'live',
      userId: 'U',
      source: 'amazon',
      token: 't',
    });
    assert.equal(a, b);
  });

  it('shared/package.json files includes mapping/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(
      pkg.files.some((f) => f === 'mapping/' || f === 'mapping'),
      'shared/package.json files[] must list mapping/',
    );
  });
});

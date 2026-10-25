'use strict';

/**
 * Hostile MRB #4933: FR #4931 12:49 self-heal _root (create-only).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ensureRootDefaultAge, NeedsDefaultAgeError } =
  require('../shared/defaultAge');

describe('MRB #4933 hostile _root self-heal', () => {
  it('create-only If-None-Match * never overwrites existing invalid root', async () => {
    const store = new Map([['_root/', { Metadata: { defaultage: '0' } }]]);
    const s3 = {
      headObject: async ({ Key }) => {
        const o = store.get(Key);
        if (!o) {
          const err = new Error('NoSuchKey');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: { ...o.Metadata } };
      },
      putObject: async () => {
        throw new Error('put must not run when _root exists');
      },
    };
    await assert.rejects(
      () => ensureRootDefaultAge(s3, 'a-affiliates'),
      NeedsDefaultAgeError,
    );
    assert.equal(store.get('_root/').Metadata.defaultage, '0');
  });

  it('412 on create re-heads the winner', async () => {
    const store = new Map();
    const s3 = {
      headObject: async ({ Key }) => {
        const o = store.get(Key);
        if (!o) {
          const err = new Error('NoSuchKey');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: { ...o.Metadata } };
      },
      putObject: async ({ Key }) => {
        store.set(Key, { Metadata: { defaultage: '6' } });
        const err = new Error('PreconditionFailed');
        err.name = 'PreconditionFailed';
        err.$metadata = { httpStatusCode: 412 };
        throw err;
      },
    };
    const meta = await ensureRootDefaultAge(s3, 'a-affiliates');
    assert.equal(meta.defaultage, '6');
  });
});

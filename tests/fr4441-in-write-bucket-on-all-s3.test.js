'use strict';

/**
 * FR #4441: writeLiveProviderInResult must set Bucket on every S3 call used for
 * IN/ write + touchLastmod (put/head/get/copy/tagging). putObject alone is not enough.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  writeLiveProviderInResult,
} = require('../shared/search/writeLiveProviderInResult');

const MSG = {
  hostkey: 'www.mymodelflyingclub.co.uk',
  guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
  searchid: 'srch_4441_test',
  env: 'live',
  queries: [{ q: 'servo' }],
};

describe('FR #4441 Bucket on every IN/ S3 call', () => {
  it('wraps head/get/copy/tagging as well as putObject with A_CLUBS_BUCKET', async () => {
    /** @type {Array<{op: string, Bucket?: string, Key?: string}>} */
    const calls = [];

    function record(op) {
      return async (args) => {
        const a = args && typeof args === 'object' ? args : {};
        calls.push({ op, Bucket: a.Bucket, Key: a.Key || a.CopySource });
        if (op === 'getObject') {
          return {
            Body: {
              transformToString: async () =>
                JSON.stringify({ lastmod: '2020-01-01T00:00:00.000Z' }),
            },
          };
        }
        if (op === 'getObjectTagging') {
          return { TagSet: [] };
        }
        // readMarkerState does not treat head NotFound as empty; return a hit.
        if (op === 'headObject') {
          return { Metadata: { lastmod: '2020-01-01T00:00:00.000Z' } };
        }
        return {};
      };
    }

    await writeLiveProviderInResult({
      msg: MSG,
      source: 'ebay',
      products: [
        {
          title: 'test',
          url: 'https://example.com/p',
          price: '1.00',
          currency: 'GBP',
        },
      ],
      envVars: { A_CLUBS_BUCKET: 'a-clubs-test' },
      putObject: record('putObject'),
      headObject: record('headObject'),
      getObject: record('getObject'),
      copyObject: record('copyObject'),
      getObjectTagging: record('getObjectTagging'),
      putObjectTagging: record('putObjectTagging'),
      now: new Date('2026-10-19T19:00:00.000Z'),
    });

    assert.ok(calls.length >= 2, 'expected put + lastmod S3 traffic');
    const missing = calls.filter((c) => !c.Bucket);
    assert.deepEqual(
      missing,
      [],
      `every S3 call needs Bucket; missing on: ${JSON.stringify(missing)}`,
    );
    for (const c of calls) {
      assert.equal(c.Bucket, 'a-clubs-test', `${c.op} Bucket`);
    }
    assert.ok(
      calls.some((c) => c.op === 'putObject'),
      'IN/ putObject required',
    );
    assert.ok(
      calls.some((c) => c.op !== 'putObject'),
      'lastmod must use non-put S3 ops',
    );
  });

  it('does not throw SDK Bucket label error when lastmod uses raw head/get', async () => {
    let sawHead = false;
    await writeLiveProviderInResult({
      msg: MSG,
      source: 'amazon',
      products: [],
      envVars: { A_CLUBS_BUCKET: 'a-clubs' },
      putObject: async (a) => {
        assert.equal(a.Bucket, 'a-clubs');
        return {};
      },
      headObject: async (a) => {
        sawHead = true;
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return { Metadata: { lastmod: '2020-01-01T00:00:00.000Z' } };
      },
      getObject: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return {
          Body: {
            transformToString: async () =>
              JSON.stringify({ lastmod: '2020-01-01T00:00:00.000Z' }),
          },
          Metadata: { lastmod: '2020-01-01T00:00:00.000Z' },
        };
      },
      copyObject: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return {};
      },
      getObjectTagging: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return { TagSet: [] };
      },
      putObjectTagging: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return {};
      },
    });
    assert.equal(sawHead, true);
  });
});

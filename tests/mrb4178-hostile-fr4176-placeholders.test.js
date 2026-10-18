'use strict';

/**
 * MRB #4178 hostile pins for FR #4176 feedurl placeholder substitution.
 * Secrets resolve from provider meta only; affiliate marker never stores them;
 * unknown placeholders never fetch.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveFeedUrlForFetch,
} = require('../affiliates/src/resolveFeedUrl');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { downloadOne } = require('../affiliates/src/downloadOne');
const { runWeekly } = require('../affiliates/src/runWeekly');
const {
  normalizeAffiliateMeta,
} = require('../shared/affiliates/metadata');

const BUCKET = 'a-affiliates';
const NOW = new Date('2026-10-18T14:00:00.000Z');
const FAKE_KEY = 'FAKE_key/with spaces+plus';
const FAKE_DARWIN = 'FAKE_darwin/hash+value';

describe('MRB #4178 hostile FR #4176 placeholders', () => {
  it('refuses affiliate-local feedapikey (provider-only secrets)', () => {
    const r = resolveFeedUrlForFetch({
      feedurl: 'https://x.example/apikey/{feedapikey}/f.csv',
      affiliateMeta: { feedapikey: FAKE_KEY, feedid: '1' },
      providerMeta: {},
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'unresolved_placeholder');
    assert.ok(r.missing.includes('feedapikey'));
  });

  it('substitutes darwinhash from provider with URI encoding', () => {
    const r = resolveFeedUrlForFetch({
      feedurl: 'https://x.example/h/{darwinhash}/out.csv',
      affiliateMeta: {},
      providerMeta: { darwinhash: FAKE_DARWIN },
    });
    assert.equal(r.ok, true);
    assert.equal(r.placeholdersResolved, true);
    assert.equal(
      r.fetchUrl,
      `https://x.example/h/${encodeURIComponent(FAKE_DARWIN)}/out.csv`,
    );
    assert.ok(!r.fetchUrl.includes('{'));
    assert.ok(r.fetchUrl.includes('%2F') || r.fetchUrl.includes('%2B') || r.fetchUrl.includes('+') || encodeURIComponent(FAKE_DARWIN) === r.fetchUrl.split('/h/')[1].split('/')[0]);
  });

  it('unknown placeholder never fetches and stamps unresolved_placeholder', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { feedapikey: 'FAKE_unused' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/9/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: '9',
        feedurl: 'https://x.example/{unknown_token}/f.csv',
        format: 'csv',
        enabled: '1',
      }),
    });
    let fetched = 0;
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: '9',
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('x') };
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'unresolved_placeholder');
    assert.equal(fetched, 0);
    const head = await s3.headObject({ Key: 'awin/9/' });
    assert.equal(head.Metadata.laststatus, 'unresolved_placeholder');
    assert.ok(String(head.Metadata.feedurl).includes('{unknown_token}'));
  });

  it('runWeekly HEADs provider marker once for two affiliates', async () => {
    const s3 = createMemoryS3();
    const origHead = s3.headObject.bind(s3);
    let providerHeads = 0;
    s3.headObject = async (input) => {
      const key = input && input.Key != null ? String(input.Key) : '';
      if (key === 'awin/' || key === 'awin') providerHeads += 1;
      return origHead(input);
    };
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { feedapikey: 'FAKE_provider_key_only' },
    });
    for (const id of ['a1', 'a2']) {
      await s3.putObject({
        Bucket: BUCKET,
        Key: `awin/${id}/`,
        Body: Buffer.alloc(0),
        Metadata: normalizeAffiliateMeta({
          affiliateid: id,
          feedurl: 'https://x.example/apikey/{feedapikey}/fid/{feedid}/f.csv',
          feedid: id === 'a1' ? '11' : '22',
          format: 'csv',
          enabled: '1',
        }),
      });
    }
    const fetched = [];
    const summary = await runWeekly({
      s3,
      bucket: BUCKET,
      now: NOW,
      log: () => {},
      fetchImpl: async (url) => {
        fetched.push(String(url));
        return {
          ok: true,
          status: 200,
          body: Buffer.from('a,b\n1,2\n', 'utf8'),
        };
      },
    });
    assert.equal(summary.ok, 2);
    assert.equal(fetched.length, 2);
    assert.ok(
      providerHeads <= 2,
      `provider HEAD should be once per provider (got ${providerHeads})`,
    );
    assert.equal(providerHeads, 1);
    for (const url of fetched) {
      assert.ok(url.includes(encodeURIComponent('FAKE_provider_key_only')));
      assert.ok(!url.includes('{feedapikey}'));
    }
  });
});

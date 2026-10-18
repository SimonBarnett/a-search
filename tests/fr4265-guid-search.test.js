'use strict';

/**
 * FR #4265: annotator writes searches.json per GUID and POSTs /search once.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { processFolderEvent } = require('../redqueen/src/annotate');
const { handleAgentSearch } = require('../entry/src/agentSearch');
const { buildSearchesDoc } = require('../redqueen/src/guidSearch');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FAKE_KEY = 'FAKE_agent_api_key_for_tests_only_32b';
const FIXED_NOW = () => new Date('2026-10-18T12:00:00.000Z');

async function seed(s3, host, guid, extraMd = {}) {
  const createdAt = '2026-10-18T11:00:00.000Z';
  await s3.putObject({
    Key: hostMarkerKey(host),
    Body: Buffer.alloc(0),
    Metadata: {
      userid: '0123456C',
      host,
      hostkey: host,
      lastmod: createdAt,
      annotated: '0',
    },
  });
  await s3.putObject({
    Key: guidMarkerKey(host, guid),
    Body: Buffer.alloc(0),
    Metadata: {
      uri: '/weekly-specials',
      seen: '0',
      clicks: '0',
      since: createdAt,
      lastmod: createdAt,
      annotated: '0',
      ...extraMd,
    },
  });
}

function deps(s3, extra) {
  return {
    headObject: s3.headObject,
    getObject: s3.getObject,
    putObject: s3.putObject,
    listObjectsV2: s3.listObjectsV2,
    copyObject: s3.copyObject,
    putObjectAnnotation: s3.putObjectAnnotation,
    getObjectAnnotation: s3.getObjectAnnotation,
    listObjectAnnotations: s3.listObjectAnnotations,
    bucket: 'a-clubs',
    now: FIXED_NOW,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        Buffer.from('<html><body><p>Weekly trainer specials</p></body></html>'),
    }),
    reviewHost: async () => ({
      model: 'test-host',
      summary: 'Radio control club in the UK',
      club: 'fixed wing',
      audience: 'sunday flyers',
      affiliateOpportunities: 'trainers',
    }),
    ...extra,
  };
}

describe('FR #4265 searches.json from the page review', () => {
  it('caps free-tier queries at 3 and keeps market, currency and exclude', () => {
    const { doc, cap } = buildSearchesDoc({
      review: {
        suggestedQueries: [
          { q: 'trainer kits', intent: 'shop', maxResults: 10 },
          'balsa wood',
          'covering film',
          'glow plugs',
        ],
      },
      steering: { market: 'UK', currency: 'GBP', exclude: ['fuel'] },
      existing: {
        queries: [],
        exclude: [{ partId: 'p1', reason: 'kept', at: '2026-10-01T00:00:00.000Z' }],
      },
      fullTier: false,
      now: '2026-10-18T12:00:00.000Z',
    });
    assert.equal(cap, 3);
    assert.equal(doc.queries.length, 3);
    assert.equal(doc.queries[0].q, 'trainer kits');
    assert.equal(doc.market, 'UK');
    assert.equal(doc.currency, 'GBP');
    assert.equal(doc.queries[0].intent, 'shop');
    assert.equal(doc.queries[0].maxResults, 10);
    assert.equal(doc.exclude[0].partId, 'p1');
    assert.equal(doc.exclude.some((e) => e.match === 'fuel'), true);
  });

  it('full tier allows more than the free cap', () => {
    const { doc, cap } = buildSearchesDoc({
      review: {
        suggestedQueries: ['one', 'two', 'three', 'four'],
      },
      fullTier: true,
      existing: { queries: [], exclude: [] },
    });
    assert.equal(cap, 15);
    assert.equal(doc.queries.length, 4);
  });
});

describe('FR #4265 annotator writes searches.json and calls /search', () => {
  it('annotated host and GUID produce searches.json and one /search call', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host, GUID);
    await s3.putObject({
      Key: `${host}/${GUID}/searches.json`,
      Body: Buffer.from(
        `${JSON.stringify({
          queries: [],
          exclude: [{ partId: 'keep-me', reason: 'seed', at: '2026-10-01T00:00:00.000Z' }],
        })}\n`,
      ),
      ContentType: 'application/json',
    });
    const posts = [];
    const result = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        reviewGuid: async (input) => {
          assert.match(JSON.stringify(input.hostAnnotations), /Radio control club/);
          return {
            model: 'test-guid',
            summary: 'Weekly trainer specials for this page only',
            intent: 'shop',
            suggestedQueries: [
              { q: 'beginner trainer', intent: 'shop', maxResults: 10 },
              'balsa',
              'film',
              'glow',
            ],
            steering: { market: 'UK', currency: 'GBP' },
          };
        },
        postSearch: async (body) => {
          posts.push(body);
          return { ok: true, status: 202, searchid: 'srch_page' };
        },
      }),
    );
    assert.equal(result.action, 'host_processed');
    assert.equal(result.guids[0].action, 'guid_annotated');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].hostkey, host);
    assert.equal(posts[0].guid, GUID);
    assert.equal(posts[0].queries.length, 3);
    assert.equal(posts[0].queries[0].q, 'beginner trainer');
    assert.equal(posts[0].market, 'UK');
    assert.equal(posts[0].currency, 'GBP');
    assert.equal(posts[0].exclude[0].partId, 'keep-me');
    const saved = await s3.getObject({ Key: `${host}/${GUID}/searches.json` });
    const doc = JSON.parse(saved.Body.toString('utf8'));
    assert.equal(doc.searchid, 'srch_page');
    assert.equal(doc.queries.length, 3);
    assert.equal(doc.exclude[0].partId, 'keep-me');
  });

  it('does not write searches or call /search when the host review fails', async () => {
    const s3 = createMemoryS3();
    const host = 'noreview.example.com';
    await seed(s3, host, GUID);
    let posts = 0;
    const result = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewHost: async () => ({ model: 'stub', usable: false }),
        reviewGuid: async () => ({ model: 'test-guid', summary: 'page' }),
        postSearch: async () => {
          posts += 1;
          return { ok: true, status: 202, searchid: 'srch_no' };
        },
      }),
    );
    assert.equal(result.action, 'retry');
    assert.equal(posts, 0);
    assert.equal(s3.objects.has(`${host}/${GUID}/searches.json`), false);
  });

  it('does not call /search when the GUID review fails', async () => {
    const s3 = createMemoryS3();
    const host = 'guidfail.example.com';
    await seed(s3, host, GUID);
    let posts = 0;
    const result = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewGuid: async () => {
          throw new Error('guid_down');
        },
        postSearch: async () => {
          posts += 1;
          return { ok: true, status: 202, searchid: 'srch_no' };
        },
      }),
    );
    assert.equal(result.guids[0].action, 'retry');
    assert.equal(posts, 0);
    assert.equal(s3.objects.has(`${host}/${GUID}/searches.json`), false);
  });

  it('a lost /search response retries without a second fan-out', async () => {
    const s3 = createMemoryS3();
    const host = 'retry.example.com';
    await seed(s3, host, GUID);
    const sent = [];
    let lost = true;
    const postSearch = async (body) => {
      const result = await handleAgentSearch({
        event: {
          headers: { 'x-agent-api-key': FAKE_KEY },
          body: {
            hostkey: body.hostkey,
            guid: body.guid,
            queries: body.queries,
            exclude: body.exclude,
          },
        },
        env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
        headObject: s3.headObject,
        getObject: s3.getObject,
        putObject: s3.putObject,
        sendMessage: async (p) => {
          sent.push(p);
        },
        newSearchId: () => 'srch_once',
        enabled: () => ['ebay'],
        loadRegistry: () => ({
          sources: [{ id: 'ebay', kind: 'live', queueEnv: 'SQS_EBAY_URL' }],
        }),
      });
      if (lost) {
        lost = false;
        throw new Error('response_lost');
      }
      return {
        ok: true,
        status: 202,
        searchid: result.searchid,
        idempotent: result.idempotent,
      };
    };
    const reviewGuid = async () => ({
      model: 'test-guid',
      summary: 'Weekly specials page for trainers',
      intent: 'shop',
      suggestedQueries: ['trainer kit'],
      steering: { market: 'UK', currency: 'GBP' },
    });
    const first = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewGuid,
        postSearch,
      }),
    );
    assert.equal(first.guids[0].action, 'retry');
    assert.equal(sent.length, 2);
    const second = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewGuid,
        postSearch,
      }),
    );
    assert.equal(second.guids[0].detail, 'search_reposted');
    assert.equal(sent.length, 2);
    assert.equal(sent[0].messageDeduplicationId, 'srch_once-ebay');
    const saved = await s3.getObject({ Key: `${host}/${GUID}/searches.json` });
    const doc = JSON.parse(saved.Body.toString('utf8'));
    assert.equal(doc.searchid, 'srch_once');
    assert.equal(doc.market, 'UK');
    assert.equal(doc.currency, 'GBP');
  });
});

describe('FR #4265 /search is idempotent per GUID', () => {
  it('a second POST returns the same searchid and does not send again', async () => {
    const s3 = createMemoryS3();
    const host = 'club.example';
    await s3.putObject({
      Key: `${host}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {},
    });
    const sent = [];
    const opts = {
      event: {
        headers: { 'x-agent-api-key': FAKE_KEY },
        body: {
          hostkey: host,
          guid: GUID,
          queries: [{ q: 'boots', intent: 'shop', maxResults: 10 }],
          exclude: [],
        },
      },
      env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      sendMessage: async (p) => {
        sent.push(p);
      },
      newSearchId: () => 'srch_fixed',
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [{ id: 'ebay', kind: 'live', queueEnv: 'SQS_EBAY_URL' }],
      }),
    };
    const first = await handleAgentSearch(opts);
    const second = await handleAgentSearch(opts);
    assert.equal(first.searchid, 'srch_fixed');
    assert.equal(first.idempotent, false);
    assert.equal(second.searchid, 'srch_fixed');
    assert.equal(second.idempotent, true);
    assert.equal(sent.length, 2);
  });
});

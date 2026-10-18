'use strict';

/**
 * FR #4279: a GUID page review must answer from the supplied text (no browse)
 * and a reviewer timeout must leave the host SQS message and annotated unset.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { drainOnce } = require('../redqueen/src/drain');
const { guidReviewPrompt, tryGrokCli } = require('../redqueen/src/reviewers');

const HOST = 'www.mymodelflyingclub.co.uk';
const SLOW = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const FAST = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const HTML =
  '<html><head><title>Product requests</title></head><body><p>Members product requests</p></body></html>';

const sleepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4279-'));
const sleepScript = path.join(sleepDir, 'sleep.js');
fs.writeFileSync(sleepScript, 'setTimeout(() => process.exit(0), 5000);\n', 'utf8');

after(() => {
  fs.rmSync(sleepDir, { recursive: true, force: true });
});

describe('FR #4279 GUID review timeout', () => {
  it('page prompt is a one-shot answer from the supplied text and does not browse', () => {
    const prompt = guidReviewPrompt({
      host: HOST,
      hostkey: HOST,
      guid: SLOW,
      uri: '/membersproductrequests',
      pageUrl: 'https://www.mymodelflyingclub.co.uk/membersproductrequests',
      pageText: 'Members product requests',
      pageHead: { title: 'Product requests' },
      hostAnnotations: { summary: 'RC club' },
    });
    assert.match(prompt, /one shot/i);
    assert.match(prompt, /supplied text/i);
    assert.match(prompt, /Do not browse/);
  });

  it('a slow GUID reviewer timeout retries, does not delete, and leaves annotated unset', async () => {
    const prev = process.env.A_SEARCH_GROK_NODE_SCRIPT;
    process.env.A_SEARCH_GROK_NODE_SCRIPT = sleepScript;
    try {
      const s3 = createMemoryS3();
      const createdAt = '2026-10-18T11:00:00.000Z';
      await s3.putObject({
        Key: hostMarkerKey(HOST),
        Body: Buffer.alloc(0),
        Metadata: {
          userid: '0123456C',
          host: HOST,
          hostkey: HOST,
          lastmod: createdAt,
          annotated: '0',
        },
      });
      for (const guid of [SLOW, FAST]) {
        await s3.putObject({
          Key: guidMarkerKey(HOST, guid),
          Body: Buffer.alloc(0),
          Metadata: {
            uri: '/membersproductrequests',
            seen: '0',
            lastmod: createdAt,
            annotated: '0',
          },
        });
      }
      let deleted = 0;
      const out = await drainOnce({
        queueUrl: 'https://sqs.example/q',
        receiveMessage: async () => ({
          Messages: [
            {
              MessageId: 'm1',
              ReceiptHandle: 'rh1',
              Body: JSON.stringify({
                hostkey: HOST,
                host: HOST,
                createdAt,
              }),
            },
          ],
        }),
        deleteMessage: async () => {
          deleted += 1;
        },
        changeMessageVisibility: async () => {},
        bucket: 'a-clubs',
        headObject: s3.headObject,
        getObject: s3.getObject,
        putObject: s3.putObject,
        listObjectsV2: s3.listObjectsV2,
        copyObject: s3.copyObject,
        putObjectAnnotation: s3.putObjectAnnotation,
        getObjectAnnotation: s3.getObjectAnnotation,
        listObjectAnnotations: s3.listObjectAnnotations,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(HTML),
        }),
        reviewHost: async () => ({
          model: 'test-host',
          summary: 'RC fixed-wing club that buys trainers.',
          club: 'RC fixed-wing',
          audience: 'Sunday members',
          affiliateOpportunities: 'trainer kits',
        }),
        reviewGuid: async (input) => {
          if (input.guid === SLOW) {
            const timed = await tryGrokCli({ prompt: 'page', timeoutMs: 200 });
            assert.match(timed.detail, /^grok_error:timeout/);
            return {
              model: 'stub',
              usable: false,
              unavailable: true,
              detail: timed.detail,
              summary: '',
            };
          }
          return {
            model: 'test-guid',
            summary: 'This page is the members product-request form.',
            intent: 'request',
            suggestedQueries: ['trainer kits'],
            steering: {
              include: ['trainer'],
              market: 'UK',
              currency: 'GBP',
              locale: 'en-GB',
            },
          };
        },
      });
      assert.equal(deleted, 0);
      assert.equal(out.actions[0].action, 'host_processed');
      const slow = out.actions[0].guids.find((g) => g.guid === SLOW);
      assert.equal(slow.action, 'retry');
      assert.match(slow.detail, /guid_reviewer_unavailable:grok_error:timeout/);
      const head = await s3.headObject({ Key: guidMarkerKey(HOST, SLOW) });
      const md = head.Metadata || head.metadata || {};
      assert.notEqual(String(md.annotated || ''), '1');
    } finally {
      if (prev == null) delete process.env.A_SEARCH_GROK_NODE_SCRIPT;
      else process.env.A_SEARCH_GROK_NODE_SCRIPT = prev;
    }
  });
});

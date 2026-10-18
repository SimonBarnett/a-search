'use strict';

/**
 * FR #4277: reject a host brief that is narration or has empty
 * club / audience / affiliate fields. Do not annotate and do not review GUIDs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { processFolderEvent } = require('../redqueen/src/annotate');
const { hostReviewPrompt, isCompleteHostBrief } = require('../redqueen/src/reviewers');
const { extractContextLinks } = require('../redqueen/src/fetchPage');

const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const HTML =
  '<html><head><title>Club</title></head><body>' +
  '<a href="/about">About</a><a href="/shop">Shop</a><a href="https://evil.example/shop">no</a>' +
  '<p>Welcome flyers</p></body></html>';

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
    ...extra,
  };
}

async function seed(s3, host) {
  const createdAt = '2026-10-18T11:00:00.000Z';
  await s3.putObject({
    Key: hostMarkerKey(host),
    Body: Buffer.alloc(0),
    Metadata: { host, hostkey: host, lastmod: createdAt, annotated: '0' },
  });
  await s3.putObject({
    Key: guidMarkerKey(host, GUID),
    Body: Buffer.alloc(0),
    Metadata: { uri: '/membersproductrequests', lastmod: createdAt, annotated: '0' },
  });
}

describe('FR #4277 host brief must be complete', () => {
  it('host prompt forbids browsing and answers from supplied text', () => {
    const prompt = hostReviewPrompt({
      host: 'www.mymodelflyingclub.co.uk',
      hostkey: 'www.mymodelflyingclub.co.uk',
      pageText: 'Club home',
      pageHead: { title: 'Club' },
      extraPages: [{ url: 'https://www.mymodelflyingclub.co.uk/about', title: 'About', text: 'We fly RC' }],
    });
    assert.match(prompt, /Do not browse/);
    assert.match(prompt, /supplied text only/);
    assert.match(prompt, /EXTRA_PAGES_BEGIN/);
    assert.match(prompt, /\/about/);
  });

  it('extractContextLinks keeps same-host about and shop only', () => {
    const links = extractContextLinks(HTML, 'https://www.mymodelflyingclub.co.uk/');
    assert.deepEqual(links, [
      'https://www.mymodelflyingclub.co.uk/about',
      'https://www.mymodelflyingclub.co.uk/shop',
    ]);
  });

  it('narration with empty fields writes nothing and skips GUID review', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host);
    let writes = 0;
    let guidReviews = 0;
    const real = s3.putObjectAnnotation;
    s3.putObjectAnnotation = async (input) => {
      writes += 1;
      return real(input);
    };
    const result = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(HTML),
        }),
        reviewHost: async () => ({
          model: 'grok',
          summary:
            "The homepage is only a starting point. I'll pull the club's other pages.",
          club: '',
          audience: '',
          affiliateOpportunities: '',
        }),
        reviewGuid: async () => {
          guidReviews += 1;
          return { model: 'grok', summary: 'page', steering: { include: ['x'] } };
        },
      }),
    );
    assert.equal(result.action, 'retry');
    assert.equal(result.detail, 'host_brief_incomplete');
    assert.equal(writes, 0);
    assert.equal(guidReviews, 0);
    assert.equal(isCompleteHostBrief({
      summary: "I'll open the about page",
      club: 'club',
      audience: 'members',
      affiliateOpportunities: 'kits',
    }), false);
    const head = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.notEqual(String(head.Metadata.annotated || ''), '1');
  });

  it('a complete brief is stored and GUID review follows', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host);
    const seen = { extra: 0 };
    const result = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        fetchImpl: async (url) => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(
            String(url).includes('/about')
              ? '<html><head><title>About</title></head><body><p>RC fixed wing</p></body></html>'
              : HTML,
          ),
        }),
        reviewHost: async (input) => {
          seen.extra = (input.extraPages || []).length;
          return {
            model: 'grok',
            summary: 'Mereside is an RC fixed-wing club.',
            club: 'RC fixed-wing club at the local patch',
            audience: 'Sunday members who buy trainers',
            affiliateOpportunities: 'trainer kits, fuel and covering film',
          };
        },
        reviewGuid: async () => ({
          model: 'grok',
          summary: 'This page is the members product-request form.',
          steering: { include: ['trainer'], market: 'UK', currency: 'GBP', locale: 'en-GB' },
        }),
      }),
    );
    assert.equal(result.action, 'host_processed');
    assert.equal(result.host, 'annotated');
    assert.equal(result.guids[0].action, 'guid_annotated');
    assert.ok(seen.extra >= 1);
    const head = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.equal(String(head.Metadata.annotated), '1');
  });
});

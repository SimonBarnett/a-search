'use strict';

/**
 * FR #4251: host brief is club / audience / affiliate opportunities.
 * Page review uses that brief plus head metadata and must not copy it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { processFolderEvent } = require('../redqueen/src/annotate');
const {
  extractHeadMetadata,
  fetchPageText,
} = require('../redqueen/src/fetchPage');
const {
  hostReviewPrompt,
  guidReviewPrompt,
  annotationsTooSimilar,
  reviewWithGrokThenCursor,
} = require('../redqueen/src/reviewers');

const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const HOST_COPY =
  'This radio control fixed-wing club flies at the local patch every Sunday and buys trainers glow engines and covering film from club night traders.';

function s3Deps(s3, extra) {
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

async function seed(s3, host, meta) {
  const createdAt = '2026-10-18T11:00:00.000Z';
  const md = meta || {};
  await s3.putObject({
    Key: hostMarkerKey(host),
    Body: Buffer.alloc(0),
    Metadata: {
      userid: '0123456C',
      host,
      hostkey: host,
      lastmod: md.lastmod || createdAt,
      lastupdate: md.lastupdate || '',
      annotated: md.annotated || '0',
    },
  });
  await s3.putObject({
    Key: guidMarkerKey(host, GUID),
    Body: Buffer.alloc(0),
    Metadata: {
      uri: '/membersproductrequests',
      seen: '0',
      clicks: '0',
      since: createdAt,
      lastmod: md.guidLastmod || createdAt,
      lastupdate: md.guidLastupdate || '',
      annotated: md.guidAnnotated || '0',
    },
  });
}

const PAGE_HTML =
  '<html><head><title>Weekly specials</title>' +
  '<meta name="description" content="Beginner trainer kits this week">' +
  '<meta name="keywords" content="trainer,balsa">' +
  '<meta property="og:title" content="Weekly specials">' +
  '</head><body><h1>Weekly specials</h1><p>Beginner trainers</p></body></html>';

describe('FR #4251 head metadata and prompts', () => {
  it('extractHeadMetadata keeps title, description, keywords and og', () => {
    const head = extractHeadMetadata(PAGE_HTML);
    assert.equal(head.title, 'Weekly specials');
    assert.match(head.description, /Beginner trainer kits/);
    assert.match(head.keywords, /trainer/);
    assert.equal(head.og['og:title'], 'Weekly specials');
  });

  it('fetchPageText returns head metadata separately from body text', async () => {
    const page = await fetchPageText({
      url: 'https://club.example/',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from(PAGE_HTML),
      }),
    });
    assert.equal(page.ok, true);
    assert.equal(page.head.title, 'Weekly specials');
    assert.match(page.text, /Beginner trainers/);
    assert.doesNotMatch(page.text, /og:title/);
  });

  it('host prompt asks for club, audience and affiliate opportunities', () => {
    const prompt = hostReviewPrompt({
      host: 'www.mymodelflyingclub.co.uk',
      hostkey: 'www.mymodelflyingclub.co.uk',
      pageUrl: 'https://www.mymodelflyingclub.co.uk/',
      pageText: 'Club home',
      pageHead: { title: 'My Model Flying Club', description: 'RC flying' },
    });
    assert.match(prompt, /Club specifics/);
    assert.match(prompt, /Audience/);
    assert.match(prompt, /Affiliate opportunities/);
    assert.match(prompt, /HEAD_META_BEGIN/);
    assert.match(prompt, /My Model Flying Club/);
  });

  it('page prompt includes the host review and this page head metadata', async () => {
    let seen = '';
    const review = await reviewWithGrokThenCursor({
      kind: 'guid',
      host: 'www.mymodelflyingclub.co.uk',
      hostkey: 'www.mymodelflyingclub.co.uk',
      guid: GUID,
      uri: '/membersproductrequests',
      pageUrl: 'https://www.mymodelflyingclub.co.uk/membersproductrequests',
      pageText: 'Member parts form',
      pageHead: {
        title: 'Product requests',
        description: 'Members ask for parts',
        keywords: 'parts',
        og: { 'og:title': 'Product requests' },
      },
      hostAnnotations: {
        summary: HOST_COPY,
        club: 'RC fixed-wing',
        audience: 'Sunday flyers',
        affiliateOpportunities: 'trainers and covering film',
      },
      tryGrok: async ({ prompt }) => {
        seen = prompt;
        return {
          ok: true,
          text: JSON.stringify({
            summary: 'This page is the members product-request form.',
            intent: 'request',
            suggestedQueries: ['trainer kits'],
            steering: {
              market: 'UK',
              currency: 'GBP',
              locale: 'en-GB',
              include: ['trainer'],
            },
          }),
        };
      },
    });
    assert.equal(review.usable, true);
    assert.match(seen, /HOST_REVIEW_BEGIN/);
    assert.match(seen, /RC fixed-wing/);
    assert.match(seen, /HEAD_META_BEGIN/);
    assert.match(seen, /title=Product requests/);
    assert.match(seen, /Do not repeat the host review/);
    assert.equal(guidReviewPrompt({ pageText: 'x', pageHead: { title: 'T' } }).includes('HOST_REVIEW_BEGIN'), true);
  });
});

describe('FR #4251 page review must not copy the host', () => {
  it('identical briefs are too similar', () => {
    assert.equal(annotationsTooSimilar(HOST_COPY, HOST_COPY), true);
    assert.equal(
      annotationsTooSimilar('Weekly specials for beginner trainer kits.', HOST_COPY),
      false,
    );
  });

  it('a copied page summary is not written', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host);
    let guidWrites = 0;
    const real = s3.putObjectAnnotation;
    s3.putObjectAnnotation = async (input) => {
      if (String(input.Key).includes(GUID)) guidWrites += 1;
      return real(input);
    };
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(PAGE_HTML),
        }),
        reviewHost: async (input) => {
          assert.equal(input.pageHead.title, 'Weekly specials');
          return {
            model: 'test-host',
            summary: HOST_COPY,
            club: 'RC fixed-wing',
            audience: 'Sunday members',
            affiliateOpportunities: 'trainers',
          };
        },
        reviewGuid: async () => ({
          model: 'test-guid',
          summary: HOST_COPY,
          intent: 'copy',
          suggestedQueries: ['club'],
        }),
      }),
    );
    assert.equal(result.guids[0].action, 'retry');
    assert.equal(result.guids[0].detail, 'page_repeats_host');
    assert.equal(guidWrites, 0);
  });

  it('REDQUEEN_REANNOTATE path rewrites an already annotated host', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    const stamp = '2026-10-18T11:00:00.000Z';
    await seed(s3, host, {
      annotated: '1',
      lastmod: stamp,
      lastupdate: stamp,
      guidAnnotated: '1',
      guidLastmod: stamp,
      guidLastupdate: stamp,
    });
    await s3.putObjectAnnotation({
      Key: hostMarkerKey(host),
      AnnotationName: 'annotation',
      AnnotationPayload: JSON.stringify({ summary: HOST_COPY, club: 'old' }),
    });
    let hostReviews = 0;
    const skipped = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(PAGE_HTML),
        }),
        reviewHost: async () => {
          hostReviews += 1;
          return { model: 'test-host', summary: HOST_COPY };
        },
        reviewGuid: async () => ({
          model: 'test-guid',
          summary: 'Members product request page, title Product requests.',
        }),
      }),
    );
    assert.equal(skipped.host, 'skipped');
    assert.equal(hostReviews, 0);

    const again = await processFolderEvent(
      s3Deps(s3, {
        reannotate: true,
        event: { hostkey: host, host },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(PAGE_HTML),
        }),
        reviewHost: async () => {
          hostReviews += 1;
          return {
            model: 'test-host',
            summary: HOST_COPY,
            club: 'RC fixed-wing',
            audience: 'members',
            affiliateOpportunities: 'kits',
          };
        },
        reviewGuid: async (input) => {
          assert.match(String(input.pageHead.title), /Weekly specials/);
          assert.match(JSON.stringify(input.hostAnnotations), /RC fixed-wing/);
          return {
            model: 'test-guid',
            summary: 'This page lists weekly beginner trainer specials.',
            steering: { include: ['trainer'], market: 'UK', currency: 'GBP', locale: 'en-GB' },
          };
        },
      }),
    );
    assert.equal(again.host, 'annotated');
    assert.equal(again.guids[0].action, 'guid_updated');
    assert.equal(hostReviews, 1);
  });

  it('docs describe REDQUEEN_REANNOTATE', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(doc, /REDQUEEN_REANNOTATE=1/);
    assert.match(doc, /affiliate opportunities/i);
  });
});

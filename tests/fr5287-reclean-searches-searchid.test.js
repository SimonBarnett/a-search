'use strict';

/**
 * FR #5287: quiet searchid path still rewrites leftover United Kingdom GBP
 * via keywordsOnly. Clean files stay untouched (no POST).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  publishGuidSearch,
  cleanSearchesQueries,
} = require('../redqueen/src/guidSearch');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const KEY = `${HOST}/${GUID}/searches.json`;

describe('FR #5287 reclean searches.json on quiet searchid path', () => {
  it('cleanSearchesQueries strips United Kingdom GBP and keeps product q', () => {
    const rows = cleanSearchesQueries(
      [
        {
          q: 'E-flite UMX Waco Yellow BNF Basic EFLU53550Y United Kingdom GBP',
          intent: 'page',
          maxResults: 10,
          brand: 'E-flite',
          sku: 'EFLU53550Y',
        },
      ],
      'GB',
      'GBP',
    );
    assert.equal(rows.length, 1);
    assert.doesNotMatch(rows[0].q, /United Kingdom/i);
    assert.doesNotMatch(rows[0].q, /\bGBP\b/);
    assert.match(rows[0].q, /EFLU53550Y|E-flite/i);
    assert.equal(rows[0].brand, 'E-flite');
    assert.equal(rows[0].sku, 'EFLU53550Y');
  });

  it('publishGuidSearch rewrites dirty q and does not POST', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Key: KEY,
      Body: Buffer.from(
        `${JSON.stringify({
          queries: [
            {
              q: 'HobbyZone Sport Cub S 2 HBZ444000 United Kingdom GBP',
              intent: 'page',
              maxResults: 10,
            },
          ],
          exclude: [],
          searchid: 'srch_old',
          annotationSchema: 'aclubs.page.v1',
          market: 'GB',
          currency: 'GBP',
        })}\n`,
      ),
    });
    let posts = 0;
    const out = await publishGuidSearch({
      hostkey: HOST,
      guid: GUID,
      getObject: s3.getObject,
      putObject: s3.putObject,
      postSearch: async () => {
        posts += 1;
        return { ok: true, status: 202, searchid: 'srch_new' };
      },
    });
    assert.equal(posts, 0);
    assert.equal(out.ok, true);
    assert.equal(out.searchid, 'srch_old');
    assert.equal(out.wrote, true);
    assert.equal(out.cleaned, true);
    const saved = JSON.parse((await s3.getObject({ Key: KEY })).Body.toString('utf8'));
    assert.equal(saved.searchid, 'srch_old');
    assert.doesNotMatch(saved.queries[0].q, /United Kingdom/i);
    assert.doesNotMatch(saved.queries[0].q, /\bGBP\b/);
    assert.match(saved.queries[0].q, /HBZ444000|HobbyZone/);
  });

  it('already-clean q stays quiet (no write, no POST)', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Key: KEY,
      Body: Buffer.from(
        `${JSON.stringify({
          queries: [{ q: 'trainer kits', intent: 'page', maxResults: 10 }],
          exclude: [],
          searchid: 'srch_already',
          annotationSchema: 'aclubs.page.v1',
        })}\n`,
      ),
    });
    let puts = 0;
    const origPut = s3.putObject;
    s3.putObject = async (input) => {
      if (input.Key === KEY) puts += 1;
      return origPut(input);
    };
    let posts = 0;
    const out = await publishGuidSearch({
      hostkey: HOST,
      guid: GUID,
      getObject: s3.getObject,
      putObject: s3.putObject,
      postSearch: async () => {
        posts += 1;
        return { ok: true, searchid: 'x' };
      },
    });
    assert.equal(posts, 0);
    assert.equal(out.wrote, false);
    assert.equal(out.idempotent, true);
    assert.equal(puts, 0);
  });

  it('docs pin FR #5287 quiet reclean', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(text, /FR #5287/);
    assert.match(text, /searchid/);
  });
});

'use strict';

/**
 * MRB #4312 hostile: REDQUEEN_REANNOTATE must not review again when
 * searches.json already has a searchid.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { processFolderEvent } = require('../redqueen/src/annotate');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOST = 'www.example.test';

describe('MRB #4312 reannotate with searchid', () => {
  it('does not review or POST when searches.json already has a searchid', async () => {
    const s3 = createMemoryS3();
    const stamp = '2026-10-18T11:00:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(HOST),
      Body: Buffer.alloc(0),
      Metadata: {
        userid: '0123456C',
        host: HOST,
        hostkey: HOST,
        lastmod: stamp,
        annotated: '1',
      },
    });
    await s3.putObjectAnnotation({
      Key: hostMarkerKey(HOST),
      AnnotationName: 'annotation',
      AnnotationPayload: JSON.stringify({ summary: 'existing host brief' }),
    });
    await s3.putObject({
      Key: guidMarkerKey(HOST, GUID),
      Body: Buffer.alloc(0),
      Metadata: {
        uri: '/weekly-specials',
        lastmod: stamp,
        annotated: '1',
      },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/searches.json`,
      Body: Buffer.from(
        `${JSON.stringify({
          queries: [{ q: 'trainer kits', intent: 'page', maxResults: 10 }],
          exclude: [],
          searchid: 'srch_already',
        })}\n`,
      ),
      ContentType: 'application/json',
    });
    let hostReviews = 0;
    let guidReviews = 0;
    let posts = 0;
    const result = await processFolderEvent({
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      putObjectAnnotation: s3.putObjectAnnotation,
      getObjectAnnotation: s3.getObjectAnnotation,
      listObjectAnnotations: s3.listObjectAnnotations,
      bucket: 'a-clubs',
      now: () => new Date('2026-10-18T12:00:00.000Z'),
      event: { hostkey: HOST, host: HOST, createdAt: 't' },
      reannotate: true,
      reviewHost: async () => {
        hostReviews += 1;
        return { model: 'no', summary: 'should not run', club: 'c', audience: 'a', affiliateOpportunities: 'o' };
      },
      reviewGuid: async () => {
        guidReviews += 1;
        return { model: 'no', summary: 'should not run', steering: { include: ['x'] } };
      },
      postSearch: async () => {
        posts += 1;
        return { ok: true, status: 202, searchid: 'srch_again' };
      },
    });
    assert.equal(hostReviews, 0);
    assert.equal(guidReviews, 0);
    assert.equal(posts, 0);
    assert.equal(result.action, 'host_processed');
    assert.equal(result.host, 'skipped');
    assert.equal(result.guids[0].detail, 'guid_unchanged');
    const saved = JSON.parse(
      (await s3.getObject({ Key: `${HOST}/${GUID}/searches.json` })).Body.toString('utf8'),
    );
    assert.equal(saved.searchid, 'srch_already');
  });
});

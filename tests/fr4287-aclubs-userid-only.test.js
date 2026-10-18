'use strict';

/**
 * FR #4287: a-clubs host markers store userid only.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { ensureAclubsHost } = require('../parts-gateway/src/ensureHost');
const { ensureAclubsWidget } = require('../parts-gateway/src/ensureWidget');
const { pagePartsAclubs } = require('../parts-gateway/src/pageParts');
const { hostMarkerKey, widgetFileKey } = require('../parts-gateway/src/aClubsKeys');
const { mintChecksummedUserId } = require('../shared/identity/madeiraUserId');
const {
  planHostMarker,
  migrateHostMarkers,
  formatMigrationCounts,
} = require('../parts-gateway/src/migrateHostUserid');

const ROOT = path.join(__dirname, '..');
const GUID = '11111111-1111-4111-8111-111111111111';

function mintFixed(bytes) {
  return () =>
    mintChecksummedUserId({
      randomBytes: () => Buffer.from(bytes),
    });
}

function s3opts(s3) {
  return {
    headObject: s3.headObject,
    putObject: s3.putObject,
    getObject: s3.getObject,
    listObjectsV2: s3.listObjectsV2,
    copyObject: s3.copyObject,
    getObjectTagging: s3.getObjectTagging,
    putObjectTagging: s3.putObjectTagging,
    putObjectAnnotation: s3.putObjectAnnotation,
    getObjectAnnotation: s3.getObjectAnnotation,
  };
}

describe('FR #4287 a-clubs userid only', () => {
  it('new host marker has userid and no legacy metadata key', async () => {
    const s3 = createMemoryS3();
    const r = await ensureAclubsHost({
      host: 'new.example.com',
      ...s3opts(s3),
      mint: mintFixed([1, 2, 3, 4, 5, 6, 7]),
    });
    const marker = s3.objects.get(hostMarkerKey('new.example.com'));
    const keys = Object.keys(marker.Metadata).map((k) => k.toLowerCase());
    assert.equal(marker.Metadata.userid, r.userid);
    assert.equal(keys.includes('customernumber'), false);
    assert.equal(r.customerNumber, undefined);
  });

  it('reader uses userid when the legacy key is absent', async () => {
    const s3 = createMemoryS3();
    const key = hostMarkerKey('only.example.com');
    await s3.putObject({
      Key: key,
      Body: Buffer.alloc(0),
      Metadata: {
        userid: 'ABC12345',
        host: 'only.example.com',
        hostkey: 'only.example.com',
        lastmod: '2020-01-01T00:00:00.000Z',
      },
    });
    const r = await ensureAclubsHost({
      host: 'only.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
    });
    assert.equal(r.created, false);
    assert.equal(r.userid, 'ABC12345');
  });

  it('plans the four migration cases', () => {
    assert.equal(
      planHostMarker({ customernumber: 'ABC12345', lastmod: '2020-01-01T00:00:00.000Z' }).action,
      'copy',
    );
    assert.equal(
      planHostMarker({ userid: 'ABC12345', customernumber: 'OTHER111' }).action,
      'report',
    );
    assert.equal(
      planHostMarker({ userid: 'ABC12345', customerNumber: 'abc12345', lastmod: 't' }).action,
      'remove',
    );
    assert.equal(planHostMarker({ userid: 'ABC12345', lastmod: 't' }).action, 'skip');
  });

  it('dry-run leaves markers unchanged; apply copies, removes, and reports', async () => {
    const s3 = createMemoryS3();
    const lastmod = '2020-01-01T00:00:00.000Z';
    await s3.putObject({
      Key: 'copy.example.com/',
      Body: Buffer.alloc(0),
      Metadata: { customernumber: 'COPY1111', host: 'copy.example.com', lastmod, email: '' },
    });
    await s3.putObject({
      Key: 'same.example.com/',
      Body: Buffer.alloc(0),
      Metadata: {
        userid: 'SAME2222',
        customerNumber: 'SAME2222',
        lastmod,
        lastupdate: '2020-01-01T00:00:00.000Z',
      },
    });
    await s3.putObjectTagging({
      Key: 'same.example.com/',
      Tagging: { TagSet: [{ Key: 'hasdns', Value: '1' }] },
    });
    await s3.putObjectAnnotation({
      Key: 'same.example.com/',
      AnnotationName: 'annotation',
      AnnotationPayload: Buffer.from('{"club":"kept"}', 'utf8'),
    });
    await s3.putObject({
      Key: 'differ.example.com/',
      Body: Buffer.alloc(0),
      Metadata: { userid: 'DIFF3333', customernumber: 'DIFF4444', lastmod },
    });
    await s3.putObject({
      Key: 'clean.example.com/',
      Body: Buffer.alloc(0),
      Metadata: { userid: 'CLEAN555', lastmod },
    });
    await s3.putObject({
      Key: 'copy.example.com/11111111-1111-4111-8111-111111111111/',
      Body: Buffer.alloc(0),
      Metadata: { uri: '/page', lastmod },
    });

    const dry = await migrateHostMarkers({ ...s3opts(s3), apply: false });
    assert.equal(dry.counts.copy, 1);
    assert.equal(dry.counts.remove, 1);
    assert.equal(dry.counts.report, 1);
    assert.equal(dry.counts.skip, 1);
    assert.equal(dry.counts.applied, 0);
    assert.equal(s3.objects.get('copy.example.com/').Metadata.customernumber, 'COPY1111');
    assert.match(formatMigrationCounts(dry), /dryRun=1/);
    assert.equal(/@/.test(formatMigrationCounts(dry)), false);

    const applied = await migrateHostMarkers({ ...s3opts(s3), apply: true });
    assert.equal(applied.counts.applied, 2);
    const copied = s3.objects.get('copy.example.com/').Metadata;
    assert.equal(copied.userid, 'COPY1111');
    assert.equal(copied.customernumber, undefined);
    assert.equal(copied.lastmod, lastmod);
    assert.equal(copied.email, '');
    const same = s3.objects.get('same.example.com/').Metadata;
    assert.equal(same.userid, 'SAME2222');
    assert.equal(same.customerNumber, undefined);
    assert.equal(same.customernumber, undefined);
    assert.equal(same.lastmod, lastmod);
    assert.equal(same.lastupdate, '2020-01-01T00:00:00.000Z');
    const tags = await s3.getObjectTagging({ Key: 'same.example.com/' });
    assert.equal(tags.TagSet.find((t) => t.Key === 'hasdns').Value, '1');
    const ann = await s3.getObjectAnnotation({
      Key: 'same.example.com/',
      AnnotationName: 'annotation',
    });
    assert.equal(ann.AnnotationPayload.toString('utf8'), '{"club":"kept"}');
    const differ = s3.objects.get('differ.example.com/').Metadata;
    assert.equal(differ.userid, 'DIFF3333');
    assert.equal(differ.customernumber, 'DIFF4444');
    const guid = s3.objects.get(
      'copy.example.com/11111111-1111-4111-8111-111111111111/',
    );
    assert.equal(guid.Metadata.uri, '/page');

    const again = await migrateHostMarkers({ ...s3opts(s3), apply: true });
    assert.equal(again.counts.copy, 0);
    assert.equal(again.counts.remove, 0);
    assert.equal(again.counts.report, 1);
    assert.equal(again.counts.applied, 0);
  });

  it('GET /parts returns userid and not customerNumber', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      origin: 'https://page.example.com',
      widgetGuid: GUID,
      ...s3opts(s3),
      mint: mintFixed([4, 4, 4, 4, 4, 4, 4]),
    });
    assert.equal(typeof page.userid, 'string');
    assert.ok(page.userid.length > 0);
    assert.equal(page.customerNumber, undefined);
    const doc = JSON.parse(
      s3.objects.get(widgetFileKey('page.example.com', GUID, 'widget.json')).Body.toString('utf8'),
    );
    assert.equal(doc.userid, page.userid);
    assert.equal(doc.customerNumber, undefined);
    const host = await ensureAclubsHost({
      host: 'page.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
    });
    const w = await ensureAclubsWidget({
      host: 'page.example.com',
      widgetGuid: '22222222-2222-4222-8222-222222222222',
      userid: host.userid,
      ...s3opts(s3),
    });
    assert.equal(w.created, true);
  });

  it('a-clubs code paths name the legacy key only in the migration module', () => {
    const allow = new Set([
      path.normalize('parts-gateway/src/migrateHostUserid.js'),
    ]);
    const roots = ['parts-gateway/src', 'redqueen', 'walrus'];
    const hits = [];
    for (const rel of roots) {
      const dir = path.join(ROOT, rel);
      if (!fs.existsSync(dir)) continue;
      walk(dir, (file) => {
        const relFile = path.relative(ROOT, file);
        if (allow.has(path.normalize(relFile))) return;
        if (!/\.(js|ps1)$/.test(file)) return;
        const text = fs.readFileSync(file, 'utf8');
        if (/customernumber/i.test(text) || /customerNumber/.test(text)) {
          hits.push(relFile);
        }
      });
    }
    assert.deepEqual(hits, []);
  });
});

function walk(dir, fn) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, fn);
    } else {
      fn(p);
    }
  }
}

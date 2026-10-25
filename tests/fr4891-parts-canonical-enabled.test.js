'use strict';

/**
 * FR #4891: canonical APartsGateway /parts; enabled replaces init; promote on
 * hasresults; widget searching/no_parts text + HTTP 202 polling.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { ensureAclubsHost } = require('../parts-gateway/src/ensureHost');
const { ensureAclubsWidget } = require('../parts-gateway/src/ensureWidget');
const { pagePartsAclubs } = require('../parts-gateway/src/pageParts');
const { handlePartsGateway } = require('../parts-gateway/src/handler');
const {
  guidMarkerKey,
  widgetFileKey,
} = require('../parts-gateway/src/aClubsKeys');
const { promoteInToLive } = require('../shared/widgets/promoteInToLive');
const {
  maybeSetHasResults,
  recordSearchTerminal,
} = require('../shared/search/searchDone');
const {
  renderPage,
  SEARCHING_TEXT,
  NO_PARTS_TEXT,
  fetchPartsPage,
} = require('../widget/a-search-widget');
const { mintChecksummedUserId } = require('../shared/identity/madeiraUserId');

const ROOT = path.join(__dirname, '..');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOST = 'club.example.com';

function mintFixed(bytes) {
  return () =>
    mintChecksummedUserId({
      randomBytes: () => Buffer.from(bytes),
    });
}

function fakeEl() {
  return {
    attrs: {},
    innerHTML: '',
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    getAttribute(k) {
      return this.attrs[k];
    },
    ownerDocument: {
      createElement() {
        return { type: '', textContent: '', setAttribute() {} };
      },
    },
    appendChild() {},
  };
}

describe('FR #4891 ensureWidget enabled/hasresults (no init)', () => {
  it('new GUID metadata has enabled=0 hasresults=0 and NO init key', async () => {
    const s3 = createMemoryS3();
    const host = await ensureAclubsHost({
      host: HOST,
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([2, 2, 2, 2, 2, 2, 2]),
    });
    const out = await ensureAclubsWidget({
      host: HOST,
      widgetGuid: GUID,
      userid: host.userid,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(out.created, true);
    assert.equal(String(out.metadata.enabled), '0');
    assert.equal(String(out.metadata.hasresults), '0');
    assert.equal(Object.prototype.hasOwnProperty.call(out.metadata, 'init'), false);
    const marker = s3.objects.get(guidMarkerKey(HOST, GUID));
    assert.equal(String(marker.Metadata.enabled), '0');
    assert.equal(String(marker.Metadata.hasresults), '0');
    assert.equal(Object.prototype.hasOwnProperty.call(marker.Metadata, 'init'), false);
  });
});

describe('FR #4891 pageParts + handler statuses', () => {
  it('enabled=0 → status searching and handler HTTP 202 + Retry-After', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([3, 3, 3, 3, 3, 3, 3]),
    });
    assert.equal(page.status, 'searching');
    assert.equal(page.enabled, 0);
    assert.equal(page.init, 0);
    assert.deepEqual(page.parts, []);
    assert.equal(page.nextOffset, null);
    assert.equal(page.retryAfterMs, 5000);

    const res = await handlePartsGateway(
      {
        queryStringParameters: { widgetGuid: GUID },
        headers: { origin: `https://${HOST}` },
      },
      { ...s3, mint: mintFixed([3, 3, 3, 3, 3, 3, 3]) },
    );
    assert.equal(res.statusCode, 202);
    assert.equal(res.headers['retry-after'], '5');
    assert.equal(JSON.parse(res.body).status, 'searching');
  });

  it('enabled=1 with live parts → 200 ok', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([4, 4, 4, 4, 4, 4, 4]),
    });
    const gKey = guidMarkerKey(HOST, GUID);
    s3.objects.get(gKey).Metadata = {
      ...s3.objects.get(gKey).Metadata,
      enabled: '1',
    };
    s3.objects.set(widgetFileKey(HOST, GUID, 'live.json'), {
      Body: Buffer.from(JSON.stringify([{ id: 'p1' }, { id: 'p2' }], null, 2), 'utf8'),
      Metadata: {},
    });
    const page = await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      offset: 0,
      n: 10,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
    });
    assert.equal(page.status, 'ok');
    assert.equal(page.enabled, 1);
    assert.equal(page.init, 1);
    assert.equal(page.parts.length, 2);

    const res = await handlePartsGateway(
      {
        queryStringParameters: { widgetGuid: GUID },
        headers: { origin: `https://${HOST}` },
      },
      s3,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).status, 'ok');
  });

  it('enabled=1 empty live → no_parts', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([5, 5, 5, 5, 5, 5, 5]),
    });
    const gKey = guidMarkerKey(HOST, GUID);
    s3.objects.get(gKey).Metadata = {
      ...s3.objects.get(gKey).Metadata,
      enabled: '1',
    };
    const page = await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
    });
    assert.equal(page.status, 'no_parts');
    assert.deepEqual(page.parts, []);
    assert.equal(page.enabled, 1);
    assert.equal(page.init, 1);

    const res = await handlePartsGateway(
      {
        queryStringParameters: { widgetGuid: GUID },
        headers: { origin: `https://${HOST}` },
      },
      s3,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).status, 'no_parts');
  });

  it('pageParts does not putObject live.json when enabled=0 even if IN/ has files', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([6, 6, 6, 6, 6, 6, 6]),
    });
    const liveKey = widgetFileKey(HOST, GUID, 'live.json');
    const before = s3.objects.get(liveKey).Body.toString('utf8');
    s3.objects.set(`${HOST}/${GUID}/IN/one.json`, {
      Body: Buffer.from(JSON.stringify([{ id: 'x' }]), 'utf8'),
      Metadata: {},
    });
    let livePuts = 0;
    const putObject = async (input) => {
      if (input && input.Key === liveKey) livePuts += 1;
      return s3.putObject(input);
    };
    const page = await pagePartsAclubs({
      origin: `https://${HOST}`,
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(page.status, 'searching');
    assert.equal(livePuts, 0);
    assert.equal(s3.objects.get(liveKey).Body.toString('utf8'), before);
    assert.equal(s3.objects.get(guidMarkerKey(HOST, GUID)).Metadata.enabled, '0');
  });
});

describe('FR #4891 ASearchStack has no active /parts route', () => {
  it('a-search-stack.js source has no path: \'/parts\' route', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    // Active route removed; comment may mention path: '/parts' as FR note.
    const active = /httpApi\.addRoutes\(\s*\{[^}]*path:\s*['"]\/parts['"]/s.test(
      src,
    );
    assert.equal(active, false);
    assert.match(src, /FR #4891/);
    assert.match(src, /APartsGateway/);
  });
});

describe('FR #4891 widget searching + no_parts text', () => {
  it('renderPage searching text is exactly Searching for parts...', () => {
    const el = fakeEl();
    renderPage(
      el,
      { status: 'searching', parts: [], layout: 'horizontal' },
      'horizontal',
    );
    assert.equal(el.attrs['data-state'], 'searching');
    assert.equal(el.innerHTML, `<div class="searching-msg">${SEARCHING_TEXT}</div>`);
    assert.equal(SEARCHING_TEXT, 'Searching for parts...');
  });

  it('renderPage no_parts text is exactly No parts found', () => {
    const el = fakeEl();
    renderPage(
      el,
      { status: 'no_parts', parts: [], enabled: 1, init: 1, layout: 'horizontal' },
      'horizontal',
    );
    assert.equal(el.attrs['data-state'], 'empty');
    assert.equal(el.innerHTML, `<div class="empty-msg">${NO_PARTS_TEXT}</div>`);
    assert.equal(NO_PARTS_TEXT, 'No parts found');
  });

  it('fetchPartsPage treats HTTP 202 as success', async () => {
    const page = await fetchPartsPage({
      apiBase: 'https://api.example',
      widgetGuid: GUID,
      fetch: async () => ({
        ok: false,
        status: 202,
        headers: { get: (n) => (String(n).toLowerCase() === 'retry-after' ? '5' : null) },
        json: async () => ({
          status: 'searching',
          parts: [],
          init: 0,
          enabled: 0,
        }),
      }),
    });
    assert.equal(page.status, 'searching');
    assert.equal(page.retryAfterMs, 5000);
  });
});

describe('FR #4891 promoteInToLive + maybeSetHasResults', () => {
  it('promoteInToLive sets enabled=1 and writes live.json from IN/', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Key: `${HOST}/`,
      Body: Buffer.alloc(0),
      Metadata: { userid: 'ABC1234X', hostkey: HOST, lastmod: 't0' },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        enabled: '0',
        hasresults: '1',
        annotated: '1',
        lastmod: 't0',
      },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/live.json`,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/IN/a.json`,
      Body: JSON.stringify([{ id: 'a1', title: 'Part A' }]),
    });
    const out = await promoteInToLive({
      host: HOST,
      guid: GUID,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      now: '2026-10-25T18:00:00.000Z',
    });
    assert.equal(out.enabled, 1);
    assert.equal(out.live.length, 1);
    assert.equal(out.live[0].id, 'a1');
    const md = (await s3.headObject({ Key: `${HOST}/${GUID}/` })).Metadata;
    assert.equal(String(md.enabled), '1');
    const live = JSON.parse(
      (await s3.getObject({ Key: `${HOST}/${GUID}/live.json` })).Body.toString('utf8'),
    );
    assert.equal(live.length, 1);
  });

  it('maybeSetHasResults path triggers promote (memory S3)', async () => {
    const s3 = createMemoryS3();
    const searchid = 'srch_4891';
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        lastmod: 't0',
      },
    });
    await s3.putObject({
      Key: `${HOST}/`,
      Body: Buffer.alloc(0),
      Metadata: { userid: 'ABC1234Y', hostkey: HOST, lastmod: 't0' },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/live.json`,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid, queued: ['amazon'], at: 't' }),
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/IN/cand.json`,
      Body: JSON.stringify([{ id: 'from-in' }]),
    });
    const deps = {
      bucket: 'test-a-clubs',
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      now: '2026-10-25T18:30:00.000Z',
    };
    const flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid,
      source: 'amazon',
      status: 'serviced',
      products: 1,
    });
    assert.equal(flip.hasresults, true);
    assert.ok(flip.flip && flip.flip.promote);
    assert.equal(flip.flip.promote.enabled, 1);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.equal(String(head.Metadata.enabled), '1');
    const live = JSON.parse(
      (await s3.getObject({ Key: `${HOST}/${GUID}/live.json` })).Body.toString('utf8'),
    );
    assert.ok(live.some((p) => p && p.id === 'from-in'));

    // Direct maybeSetHasResults when already complete is still hasresults true.
    const again = await maybeSetHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid,
    });
    assert.equal(again.hasresults, true);
  });
});

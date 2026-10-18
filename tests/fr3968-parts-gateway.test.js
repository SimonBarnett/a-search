'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CHARSET,
  checksumChar,
  isChecksumValid,
  mintChecksummedUserId,
  mintUniqueUserId,
} = require('../shared/identity/madeiraUserId');
const {
  safeHostFolderName,
  touchLastmod,
  setInit,
  setHostCredentials,
  setHostStripe,
  hashHostPassword,
  isHostPasswordHash,
  partsResponseLeaksSecrets,
} = require('../shared/widgets/hostFolderMeta');
const {
  buildFolderEvent,
  messageGroupId,
  messageDeduplicationId,
} = require('../shared/aClubs/folderEvents');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { ensureAclubsHost } = require('../parts-gateway/src/ensureHost');
const { ensureAclubsWidget } = require('../parts-gateway/src/ensureWidget');
const { pagePartsAclubs } = require('../parts-gateway/src/pageParts');
const { handlePartsGateway, isPartsRoute } = require('../parts-gateway/src/handler');
const {
  hostFromOriginHeader,
  requireHostFromOrigin,
} = require('../parts-gateway/src/originHost');
const { resolvePageUri } = require('../parts-gateway/src/pageUri');
const {
  hostMarkerKey,
  useridClaimKey,
  widgetFileKey,
  guidMarkerKey,
} = require('../parts-gateway/src/aClubsKeys');
const { buildPartsUrl, renderPage } = require('../widget/a-search-widget');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ROOT = path.join(__dirname, '..');

function mintFixed(bytes) {
  return () =>
    mintChecksummedUserId({
      randomBytes: () => Buffer.from(bytes),
    });
}

function memoryQueue() {
  /** @type {object[]} */
  const messages = [];
  return {
    messages,
    sendMessage: async (input) => {
      messages.push(input);
      return { MessageId: `m-${messages.length}` };
    },
  };
}

describe('FR #3968 madeira userid checksum', () => {
  it('checksumChar matches Madeira sum(indexOf) % 36', () => {
    const seven = '0123456';
    let sum = 0;
    for (const ch of seven) sum += CHARSET.indexOf(ch);
    assert.equal(checksumChar(seven), CHARSET[sum % 36]);
  });

  it('mintChecksummedUserId is 8 chars and checksum-valid', () => {
    const id = mintChecksummedUserId({
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4, 5, 6]),
    });
    assert.equal(id.length, 8);
    assert.equal(isChecksumValid(id), true);
    assert.equal(id[7], checksumChar(id.slice(0, 7)));
  });

  it('mintUniqueUserId retries on collision then claims', async () => {
    const taken = new Set();
    let n = 0;
    const id = await mintUniqueUserId({
      mint: () => {
        n += 1;
        return mintChecksummedUserId({
          randomBytes: () => Buffer.from([10, 11, 12, 13, 14, 15, n === 1 ? 1 : 2]),
        });
      },
      claim: async (cand) => {
        if (taken.has(cand)) return false;
        if (taken.size === 0) {
          taken.add(cand);
          return false;
        }
        taken.add(cand);
        return true;
      },
      maxAttempts: 25,
    });
    assert.equal(isChecksumValid(id), true);
    assert.ok(n >= 2);
  });
});

describe('FR #3968 host normalisation', () => {
  it('safeHostFolderName strips scheme and path', () => {
    assert.equal(safeHostFolderName('https://Shop.Example.com/path'), 'shop.example.com');
  });
});

describe('FR #3968 Origin-only host', () => {
  it('requireHostFromOrigin returns origin_required when missing', () => {
    assert.deepEqual(requireHostFromOrigin(undefined), {
      ok: false,
      code: 'origin_required',
    });
    assert.deepEqual(requireHostFromOrigin(''), {
      ok: false,
      code: 'origin_required',
    });
    assert.deepEqual(requireHostFromOrigin('not-a-url'), {
      ok: false,
      code: 'origin_required',
    });
  });

  it('hostFromOriginHeader parses hostname', () => {
    assert.equal(hostFromOriginHeader('https://Shop.Example.com'), 'shop.example.com');
  });

  it('requireHostFromOrigin ok with parseable Origin', () => {
    assert.deepEqual(requireHostFromOrigin('https://shop.example.com'), {
      ok: true,
      host: 'shop.example.com',
    });
  });
});

describe('FR #3968 pageUri prefers Referer', () => {
  it('uses Referer path over pageUri query', () => {
    assert.equal(
      resolvePageUri({
        referer: 'https://shop.example.com/from-ref?x=1',
        pageUri: '/from-query',
      }),
      '/from-ref',
    );
  });

  it('falls back to pageUri/uri when no Referer', () => {
    assert.equal(resolvePageUri({ pageUri: '/guides/boots' }), '/guides/boots');
    assert.equal(resolvePageUri({ uri: '/only-uri' }), '/only-uri');
  });
});

describe('FR #3968 ensure host + widget on a-clubs', () => {
  it('creates host marker with checksummed userid metadata and lastmod', async () => {
    const s3 = createMemoryS3();
    const r = await ensureAclubsHost({
      host: 'Club.Example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([1, 2, 3, 4, 5, 6, 7]),
    });
    assert.equal(r.created, true);
    assert.equal(r.hostkey, 'club.example.com');
    assert.equal(isChecksumValid(r.userid), true);
    assert.equal(r.customerNumber, r.userid);
    assert.equal(r.metadata.customerNumber, r.userid);
    assert.ok(r.metadata.lastmod);
    assert.match(r.metadata.lastmod, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.ok(s3.objects.has(hostMarkerKey('club.example.com')));
    assert.ok(s3.objects.has(useridClaimKey(r.userid)));
    const marker = s3.objects.get(hostMarkerKey('club.example.com'));
    assert.equal(marker.Body.length, 0);
    assert.equal(marker.Metadata.userid, r.userid);
    assert.equal(marker.Metadata.hostkey, 'club.example.com');
    assert.equal(marker.Metadata.lastmod, r.metadata.lastmod);
    assert.equal(marker.Metadata.email, '');
    assert.equal(marker.Metadata.passwordhash, '');
    assert.equal(marker.Metadata.stripeaccountid, '');
    assert.equal(marker.Metadata.stripecustomerid, '');
  });

  it('host ensure is idempotent on repeat', async () => {
    const s3 = createMemoryS3();
    const a = await ensureAclubsHost({
      host: 'idem.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      mint: mintFixed([9, 8, 7, 6, 5, 4, 3]),
    });
    const b = await ensureAclubsHost({
      host: 'idem.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
    });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.userid, a.userid);
  });

  it('creates GUID folder marker + seed files; metadata on marker not widget.json', async () => {
    const s3 = createMemoryS3();
    const host = await ensureAclubsHost({
      host: 'w.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([2, 2, 2, 2, 2, 2, 2]),
    });
    const w = await ensureAclubsWidget({
      host: 'w.example.com',
      widgetGuid: GUID,
      customerNumber: host.customerNumber,
      referer: 'https://w.example.com/page/one',
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(w.created, true);
    assert.equal(w.uri, '/page/one');
    assert.equal(w.metadata.uri, '/page/one');
    assert.equal(w.metadata.seen, '0');
    assert.equal(w.metadata.clicks, '0');
    assert.equal(w.metadata.annotated, '0');
    assert.equal(w.metadata.init, '0');
    assert.ok(w.metadata.since);
    assert.ok(w.metadata.lastmod);
    const markerKey = guidMarkerKey('w.example.com', GUID);
    assert.ok(s3.objects.has(markerKey));
    const marker = s3.objects.get(markerKey);
    assert.equal(marker.Body.length, 0);
    assert.equal(marker.Metadata.uri, '/page/one');
    assert.equal(marker.Metadata.init, '0');
    assert.ok(s3.objects.has(widgetFileKey('w.example.com', GUID, 'widget.json')));
    assert.ok(s3.objects.has(widgetFileKey('w.example.com', GUID, 'live.json')));
    assert.ok(s3.objects.has(widgetFileKey('w.example.com', GUID, 'searches.json')));
    const widgetObj = s3.objects.get(widgetFileKey('w.example.com', GUID, 'widget.json'));
    assert.deepEqual(widgetObj.Metadata || {}, {});
    const live = JSON.parse(
      s3.objects.get(widgetFileKey('w.example.com', GUID, 'live.json')).Body.toString('utf8'),
    );
    assert.deepEqual(live, []);
  });

  it('concurrent first host creates: conditional PUT leaves one marker', async () => {
    const s3 = createMemoryS3();
    let mintN = 0;
    const mint = () => {
      mintN += 1;
      return mintChecksummedUserId({
        randomBytes: () => Buffer.from([3, 3, 3, 3, 3, 3, mintN]),
      });
    };
    const [a, b] = await Promise.all([
      ensureAclubsHost({
        host: 'race.example.com',
        headObject: s3.headObject,
        putObject: s3.putObject,
        mint,
      }),
      ensureAclubsHost({
        host: 'race.example.com',
        headObject: s3.headObject,
        putObject: s3.putObject,
        mint,
      }),
    ]);
    const markers = [...s3.objects.keys()].filter((k) => k === 'race.example.com/');
    assert.equal(markers.length, 1);
    assert.ok(a.userid);
    assert.ok(b.userid);
  });
});

describe('FR #3968 lastmod touchLastmod setInit', () => {
  it('touchLastmod bumps lastmod and preserves other metadata + tags', async () => {
    const s3 = createMemoryS3();
    const key = 'touch.example.com/';
    await s3.putObject({
      Key: key,
      Body: Buffer.alloc(0),
      Metadata: {
        userid: 'ABC12345',
        host: 'touch.example.com',
        hostkey: 'touch.example.com',
        customerNumber: 'ABC12345',
        lastmod: '2020-01-01T00:00:00.000Z',
        annotated: '0',
      },
    });
    await s3.putObjectTagging({
      Key: key,
      Tagging: { TagSet: [{ Key: 'hasdns', Value: '1' }] },
    });
    const before = (await s3.headObject({ Key: key })).Metadata.lastmod;
    const r = await touchLastmod({
      Key: key,
      now: new Date('2026-10-18T12:00:00.000Z'),
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(r.lastmod, '2026-10-18T12:00:00.000Z');
    assert.notEqual(r.lastmod, before);
    assert.equal(r.metadata.userid, 'ABC12345');
    assert.equal(r.metadata.annotated, '0');
    const tags = await s3.getObjectTagging({ Key: key });
    assert.equal(tags.TagSet.find((t) => t.Key === 'hasdns').Value, '1');
  });

  it('setInit sets init=1 on GUID folder marker, bumps lastmod, never back to 0', async () => {
    const s3 = createMemoryS3();
    const key = guidMarkerKey('init.example.com', GUID);
    await s3.putObject({
      Key: key,
      Body: Buffer.alloc(0),
      Metadata: {
        uri: '/x',
        seen: '0',
        clicks: '0',
        since: '2026-01-01T00:00:00.000Z',
        lastmod: '2026-01-01T00:00:00.000Z',
        annotated: '0',
        init: '0',
      },
    });
    const r = await setInit({
      Key: key,
      now: new Date('2026-10-18T13:00:00.000Z'),
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
    });
    assert.equal(r.init, 1);
    assert.equal(r.metadata.init, '1');
    assert.equal(r.lastmod, '2026-10-18T13:00:00.000Z');
    const again = await setInit({
      Key: key,
      now: new Date('2026-10-18T14:00:00.000Z'),
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
    });
    assert.equal(again.metadata.init, '1');
    assert.equal(again.lastmod, '2026-10-18T14:00:00.000Z');
  });

  it('seed writes bump GUID and host lastmod; plain read does not', async () => {
    const s3 = createMemoryS3();
    const host = await ensureAclubsHost({
      host: 'bump.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([4, 4, 4, 4, 4, 4, 4]),
      now: new Date('2026-10-18T10:00:00.000Z'),
    });
    const hostLast1 = s3.objects.get(hostMarkerKey('bump.example.com')).Metadata.lastmod;
    assert.equal(hostLast1, '2026-10-18T10:00:00.000Z');

    await ensureAclubsWidget({
      host: 'bump.example.com',
      widgetGuid: GUID,
      customerNumber: host.customerNumber,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      now: new Date('2026-10-18T10:05:00.000Z'),
    });
    const hostLast2 = s3.objects.get(hostMarkerKey('bump.example.com')).Metadata.lastmod;
    const guidLast = s3.objects.get(
      guidMarkerKey('bump.example.com', GUID),
    ).Metadata.lastmod;
    assert.equal(hostLast2, '2026-10-18T10:05:00.000Z');
    assert.equal(guidLast, '2026-10-18T10:05:00.000Z');

    await pagePartsAclubs({
      origin: 'https://bump.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(
      s3.objects.get(hostMarkerKey('bump.example.com')).Metadata.lastmod,
      hostLast2,
    );
    assert.equal(
      s3.objects.get(guidMarkerKey('bump.example.com', GUID)).Metadata.lastmod,
      guidLast,
    );
  });
});

describe('FR #3968 host credentials + Stripe ids', () => {
  it('hashHostPassword never stores plaintext; isHostPasswordHash detects format', () => {
    const hashed = hashHostPassword('FAKE_plain_for_test', {
      salt: Buffer.alloc(16, 7),
    });
    assert.equal(isHostPasswordHash(hashed), true);
    assert.equal(hashed.includes('FAKE_plain_for_test'), false);
    assert.match(hashed, /^scrypt\$16384\$8\$1\$/);
  });

  it('setHostCredentials sets email/hash, bumps lastmod, keeps tags', async () => {
    const s3 = createMemoryS3();
    const key = hostMarkerKey('cred.example.com');
    await s3.putObject({
      Key: key,
      Body: Buffer.alloc(0),
      Metadata: {
        userid: 'ABC12345',
        host: 'cred.example.com',
        hostkey: 'cred.example.com',
        customerNumber: 'ABC12345',
        lastmod: '2020-01-01T00:00:00.000Z',
        email: '',
        passwordhash: '',
        stripeaccountid: '',
        stripecustomerid: '',
        annotated: '0',
      },
    });
    await s3.putObjectTagging({
      Key: key,
      Tagging: { TagSet: [{ Key: 'hasdns', Value: '1' }] },
    });
    const r = await setHostCredentials({
      Key: key,
      email: 'owner@example.com',
      password: 'FAKE_plain_for_test',
      now: new Date('2026-10-18T15:00:00.000Z'),
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(r.email, 'owner@example.com');
    assert.equal(r.passwordhashSet, true);
    assert.equal(r.lastmod, '2026-10-18T15:00:00.000Z');
    assert.equal(isHostPasswordHash(r.metadata.passwordhash), true);
    assert.equal(r.metadata.passwordhash.includes('FAKE_plain_for_test'), false);
    assert.equal(r.metadata.userid, 'ABC12345');
    const tags = await s3.getObjectTagging({ Key: key });
    assert.equal(tags.TagSet.find((t) => t.Key === 'hasdns').Value, '1');
  });

  it('setHostStripe sets Connect/Customer ids, bumps lastmod, keeps other meta', async () => {
    const s3 = createMemoryS3();
    const key = hostMarkerKey('stripe.example.com');
    await s3.putObject({
      Key: key,
      Body: Buffer.alloc(0),
      Metadata: {
        userid: 'ABC12345',
        host: 'stripe.example.com',
        hostkey: 'stripe.example.com',
        customerNumber: 'ABC12345',
        lastmod: '2020-01-01T00:00:00.000Z',
        email: '',
        passwordhash: '',
        stripeaccountid: '',
        stripecustomerid: '',
        annotated: '0',
      },
    });
    const r = await setHostStripe({
      Key: key,
      accountId: 'acct_FAKE_test',
      customerId: 'cus_FAKE_test',
      now: new Date('2026-10-18T16:00:00.000Z'),
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
    });
    assert.equal(r.stripeaccountid, 'acct_FAKE_test');
    assert.equal(r.stripecustomerid, 'cus_FAKE_test');
    assert.equal(r.lastmod, '2026-10-18T16:00:00.000Z');
    assert.equal(r.metadata.userid, 'ABC12345');
    assert.equal(r.metadata.email, '');
  });

  it('GET /parts never returns email passwordhash or stripe ids', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      origin: 'https://secret.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([9, 9, 9, 9, 9, 9, 9]),
    });
    assert.equal(partsResponseLeaksSecrets(page), false);
    assert.equal('email' in page, false);
    assert.equal('passwordhash' in page, false);
    assert.equal('stripeaccountid' in page, false);
    assert.equal('stripecustomerid' in page, false);
    const body = JSON.stringify(page);
    assert.equal(/passwordhash|stripeaccountid|stripecustomerid|"email"/.test(body), false);

    const hostKey = hostMarkerKey('secret.example.com');
    await setHostCredentials({
      Key: hostKey,
      email: 'hidden@example.com',
      passwordHash: hashHostPassword('FAKE_plain_for_test', {
        salt: Buffer.alloc(16, 3),
      }),
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
    });
    await setHostStripe({
      Key: hostKey,
      accountId: 'acct_FAKE_hidden',
      customerId: 'cus_FAKE_hidden',
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
    });
    const again = await pagePartsAclubs({
      origin: 'https://secret.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
    });
    assert.equal(partsResponseLeaksSecrets(again), false);
    const againBody = JSON.stringify(again);
    assert.equal(againBody.includes('hidden@example.com'), false);
    assert.equal(againBody.includes('acct_FAKE_hidden'), false);
    assert.equal(againBody.includes('cus_FAKE_hidden'), false);
  });
});

describe('FR #3968 folder events SQS', () => {
  it('buildFolderEvent shape and MessageGroupId', () => {
    const ev = buildFolderEvent({
      hostkey: 'shop.example.com',
      host: 'shop.example.com',
      createdAt: '2026-10-18T10:00:00.000Z',
    });
    assert.deepEqual(ev, {
      hostkey: 'shop.example.com',
      host: 'shop.example.com',
      createdAt: '2026-10-18T10:00:00.000Z',
    });
    assert.equal(messageGroupId(ev), 'shop.example.com');
    assert.ok(messageDeduplicationId({ ...ev, reason: 'host' }).includes('host'));
  });

  it('publishes one host event on new host and one on new GUID; none on repeat', async () => {
    const s3 = createMemoryS3();
    const q = memoryQueue();
    const page1 = await pagePartsAclubs({
      origin: 'https://evt.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([6, 6, 6, 6, 6, 6, 6]),
      sendMessage: q.sendMessage,
      folderEventsQueueUrl: 'https://sqs.example/a-clubs-new-folders.fifo',
    });
    assert.equal(page1.init, 0);
    assert.equal(q.messages.length, 2);
    const bodies = q.messages.map((m) => JSON.parse(String(m.MessageBody).trim()));
    assert.equal(bodies[0].hostkey, 'evt.example.com');
    assert.equal(bodies[0].host, 'evt.example.com');
    assert.ok(bodies[0].createdAt);
    assert.equal(bodies[1].hostkey, 'evt.example.com');
    assert.equal(q.messages[0].MessageGroupId, 'evt.example.com');
    assert.equal(q.messages[1].MessageGroupId, 'evt.example.com');

    await pagePartsAclubs({
      origin: 'https://evt.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      sendMessage: q.sendMessage,
      folderEventsQueueUrl: 'https://sqs.example/a-clubs-new-folders.fifo',
    });
    assert.equal(q.messages.length, 2);
  });
});

describe('FR #3968 pagePartsAclubs + handler', () => {
  it('auto-creates host+guid and returns empty parts page with init 0', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      origin: 'https://page.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      mint: mintFixed([4, 4, 4, 4, 4, 4, 4]),
    });
    assert.equal(page.widgetGuid, GUID);
    assert.equal(page.layout, 'horizontal');
    assert.deepEqual(page.parts, []);
    assert.equal(page.nextOffset, null);
    assert.equal(page.init, 0);
    assert.equal(isChecksumValid(page.customerNumber), true);
  });

  it('ignores ?host= and uses Origin', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      origin: 'https://real.example.com',
      host: 'ignored.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([7, 7, 7, 7, 7, 7, 7]),
    });
    assert.ok(s3.objects.has(hostMarkerKey('real.example.com')));
    assert.equal(s3.objects.has(hostMarkerKey('ignored.example.com')), false);
    assert.equal(page.init, 0);
  });

  it('pages live.json and sets nextOffset', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      origin: 'https://live.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([5, 5, 5, 5, 5, 5, 5]),
    });
    // Force init=1 so parts render from live.json without Searching promotion path
    const gKey = guidMarkerKey('live.example.com', GUID);
    const gObj = s3.objects.get(gKey);
    gObj.Metadata = { ...gObj.Metadata, init: '1' };
    const liveKey = widgetFileKey('live.example.com', GUID, 'live.json');
    s3.objects.set(liveKey, {
      Body: Buffer.from(
        JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }], null, 2),
        'utf8',
      ),
      Metadata: {},
    });
    const page = await pagePartsAclubs({
      origin: 'https://live.example.com',
      widgetGuid: GUID,
      offset: 0,
      n: 2,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
    });
    assert.equal(page.parts.length, 2);
    assert.equal(page.nextOffset, 2);
    assert.equal(page.init, 1);
  });

  it('promotes IN/ into live.json and setInit when init is 0', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      origin: 'https://promo.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      mint: mintFixed([8, 8, 8, 8, 8, 8, 8]),
    });
    const inKey = `promo.example.com/${GUID}/IN/cand1.json`;
    s3.objects.set(inKey, {
      Body: Buffer.from(JSON.stringify([{ id: 'a' }, { id: 'b' }]), 'utf8'),
      Metadata: {},
    });
    const page = await pagePartsAclubs({
      origin: 'https://promo.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
    });
    assert.equal(page.init, 1);
    assert.equal(page.parts.length, 2);
    const live = JSON.parse(
      s3.objects
        .get(widgetFileKey('promo.example.com', GUID, 'live.json'))
        .Body.toString('utf8'),
    );
    assert.equal(live.length, 2);
    assert.equal(
      s3.objects.get(guidMarkerKey('promo.example.com', GUID)).Metadata.init,
      '1',
    );
    assert.deepEqual(
      s3.objects.get(widgetFileKey('promo.example.com', GUID, 'widget.json')).Metadata ||
        {},
      {},
    );
  });

  it('handler returns 400 origin_required when Origin missing', async () => {
    const s3 = createMemoryS3();
    const res = await handlePartsGateway(
      {
        queryStringParameters: {
          host: 'a.example.com',
          widgetGuid: GUID,
        },
        headers: {},
      },
      s3,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, 'origin_required');
  });

  it('handler ignores ?host= mismatch and uses Origin', async () => {
    const s3 = createMemoryS3();
    const res = await handlePartsGateway(
      {
        queryStringParameters: {
          host: 'wrong.example.com',
          widgetGuid: GUID,
        },
        headers: { origin: 'https://right.example.com' },
      },
      {
        ...s3,
        mint: mintFixed([1, 1, 1, 1, 1, 1, 9]),
      },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.init, 0);
    assert.ok(s3.objects.has(hostMarkerKey('right.example.com')));
  });

  it('handler returns 400 for invalid GUID and offset', async () => {
    const s3 = createMemoryS3();
    const badGuid = await handlePartsGateway(
      {
        queryStringParameters: { widgetGuid: 'not-a-guid' },
        headers: { origin: 'https://a.example.com' },
      },
      s3,
    );
    assert.equal(badGuid.statusCode, 400);
    assert.equal(JSON.parse(badGuid.body).error, 'invalid_widget_guid');

    const badOff = await handlePartsGateway(
      {
        queryStringParameters: {
          widgetGuid: GUID,
          offset: '-1',
        },
        headers: { origin: 'https://a.example.com' },
      },
      s3,
    );
    assert.equal(badOff.statusCode, 400);
    assert.equal(JSON.parse(badOff.body).error, 'invalid_offset_or_n');
  });

  it('isPartsRoute matches GET /parts', () => {
    assert.equal(isPartsRoute('GET', '/parts'), true);
    assert.equal(isPartsRoute('POST', '/parts'), false);
  });
});

describe('FR #3968 widget buildPartsUrl + Searching', () => {
  it('buildPartsUrl omits host and may send pageUri', () => {
    const u = buildPartsUrl('https://api.example', {
      widgetGuid: GUID,
      offset: 0,
      n: 10,
      uri: '/path',
    });
    assert.equal(/[?&]host=/.test(u), false);
    assert.match(u, /widgetGuid=/);
    assert.match(u, /pageUri=%2Fpath/);
  });

  it('renderPage shows Searching when init is 0', () => {
    const el = {
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
    renderPage(el, { init: 0, parts: [{ id: 1 }], layout: 'horizontal' }, 'horizontal');
    assert.equal(el.attrs['data-state'], 'searching');
    assert.match(el.innerHTML, /Searching/);
  });
});

describe('FR #3968 CDK stack isolation (source pins)', () => {
  it('parts-gateway stack pins CORS star and folder-events FIFO', () => {
    const stackPath = path.join(ROOT, 'cdk', 'lib', 'parts-gateway-stack.js');
    const binPath = path.join(ROOT, 'cdk', 'bin', 'parts-gateway.js');
    assert.equal(fs.existsSync(stackPath), true);
    assert.equal(fs.existsSync(binPath), true);
    const stack = fs.readFileSync(stackPath, 'utf8');
    const bin = fs.readFileSync(binPath, 'utf8');
    assert.equal(stack.includes('ASearchStack'), false);
    assert.equal(bin.includes('ASearchStack'), false);
    assert.equal(/require\(.*a-search-stack/i.test(stack), false);
    assert.equal(/aws-cdk-lib\/aws-ec2/.test(stack), false);
    assert.equal(/SecretsManager|aws-secretsmanager/.test(stack), false);
    assert.equal(/mssql/i.test(stack), false);
    assert.equal(/require\([^)]*resolve-cors-origins/.test(stack), false);
    assert.equal(/\bresolveCorsOrigins\s*\(/.test(stack), false);
    assert.match(stack, /allowOrigins:\s*\[\s*['"]\*['"]\s*\]/);
    assert.match(stack, /allowCredentials:\s*false/);
    assert.match(stack, /a-clubs-new-folders\.fifo/);
    assert.match(stack, /a-clubs-new-folders-dlq\.fifo/);
    assert.match(stack, /a-search-redqueen-annotator/);
    assert.match(stack, /A_CLUBS_FOLDER_EVENTS_QUEUE_URL/);
    assert.match(stack, /grantSendMessages/);
    assert.match(stack, /grantConsumeMessages/);
    assert.match(stack, /a-clubs/);
    assert.match(stack, /PartsGateway/);
    assert.match(bin, /APartsGateway/);
  });

  it('stage script includes shared/aClubs and client-sqs', () => {
    const stage = fs.readFileSync(
      path.join(ROOT, 'scripts', 'stage-parts-gateway-lambda-asset.js'),
      'utf8',
    );
    assert.match(stage, /shared\/aClubs/);
    assert.match(stage, /client-sqs/);
  });

  it('shared package.json files includes aClubs/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('aClubs/'));
  });

  it('docs cover standalone deploy and Origin-only host', () => {
    const deploy = fs.readFileSync(path.join(ROOT, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /APartsGateway|parts-gateway/);
    assert.match(deploy, /Origin/);
    const readme = fs.readFileSync(
      path.join(ROOT, 'cdk', 'README-parts-gateway.md'),
      'utf8',
    );
    assert.match(readme, /parts-gateway/);
    assert.match(readme, /origin_required/);
    assert.match(readme, /Referer/);
    assert.match(readme, /allowOrigins/);
  });
});

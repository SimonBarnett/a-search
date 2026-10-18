'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CHARSET,
  checksumChar,
  isChecksumValid,
  mintChecksummedUserId,
  mintUniqueUserId,
} = require('../shared/identity/madeiraUserId');
const { safeHostFolderName } = require('../shared/widgets/hostFolderMeta');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { ensureAclubsHost } = require('../parts-gateway/src/ensureHost');
const { ensureAclubsWidget } = require('../parts-gateway/src/ensureWidget');
const { pagePartsAclubs } = require('../parts-gateway/src/pageParts');
const { handlePartsGateway, isPartsRoute } = require('../parts-gateway/src/handler');
const { assertHostMatchesOrigin } = require('../parts-gateway/src/originHost');
const { hostMarkerKey, useridClaimKey, widgetFileKey } = require('../parts-gateway/src/aClubsKeys');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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
        // first two collide on same seven-prefix mint
        return mintChecksummedUserId({
          randomBytes: () => Buffer.from([10, 11, 12, 13, 14, 15, n === 1 ? 1 : 2]),
        });
      },
      claim: async (cand) => {
        if (taken.has(cand)) return false;
        if (taken.size === 0) {
          taken.add(cand);
          return false; // first claim fails (collision)
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

describe('FR #3968 Origin vs host', () => {
  it('allows missing Origin', () => {
    assert.deepEqual(assertHostMatchesOrigin('shop.example.com', undefined), {
      ok: true,
    });
  });

  it('403 mismatch when Origin host differs', () => {
    assert.deepEqual(
      assertHostMatchesOrigin('shop.example.com', 'https://other.example.com'),
      { ok: false, code: 'widget_host_mismatch' },
    );
  });

  it('ok when Origin matches query host', () => {
    assert.deepEqual(
      assertHostMatchesOrigin('shop.example.com', 'https://shop.example.com'),
      { ok: true },
    );
  });
});

describe('FR #3968 ensure host + widget on a-clubs', () => {
  it('creates host marker with checksummed userid metadata and default tags', async () => {
    const s3 = createMemoryS3();
    const r = await ensureAclubsHost({
      host: 'Club.Example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: () =>
        mintChecksummedUserId({
          randomBytes: () => Buffer.from([1, 2, 3, 4, 5, 6, 7]),
        }),
    });
    assert.equal(r.created, true);
    assert.equal(r.hostkey, 'club.example.com');
    assert.equal(isChecksumValid(r.userid), true);
    assert.equal(r.customerNumber, r.userid);
    assert.equal(r.metadata.customerNumber, r.userid);
    assert.ok(s3.objects.has(hostMarkerKey('club.example.com')));
    assert.ok(s3.objects.has(useridClaimKey(r.userid)));
    const marker = s3.objects.get(hostMarkerKey('club.example.com'));
    assert.equal(marker.Body.length, 0);
    assert.equal(marker.Metadata.userid, r.userid);
    assert.equal(marker.Metadata.hostkey, 'club.example.com');
  });

  it('host ensure is idempotent on repeat', async () => {
    const s3 = createMemoryS3();
    const a = await ensureAclubsHost({
      host: 'idem.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      mint: () =>
        mintChecksummedUserId({
          randomBytes: () => Buffer.from([9, 8, 7, 6, 5, 4, 3]),
        }),
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

  it('creates widget.json live.json searches.json for new GUID', async () => {
    const s3 = createMemoryS3();
    const host = await ensureAclubsHost({
      host: 'w.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      mint: () =>
        mintChecksummedUserId({
          randomBytes: () => Buffer.from([2, 2, 2, 2, 2, 2, 2]),
        }),
    });
    const w = await ensureAclubsWidget({
      host: 'w.example.com',
      widgetGuid: GUID,
      customerNumber: host.customerNumber,
      headObject: s3.headObject,
      putObject: s3.putObject,
    });
    assert.equal(w.created, true);
    assert.ok(s3.objects.has(widgetFileKey('w.example.com', GUID, 'widget.json')));
    assert.ok(s3.objects.has(widgetFileKey('w.example.com', GUID, 'live.json')));
    assert.ok(s3.objects.has(widgetFileKey('w.example.com', GUID, 'searches.json')));
    const live = JSON.parse(
      s3.objects.get(widgetFileKey('w.example.com', GUID, 'live.json')).Body.toString('utf8'),
    );
    assert.deepEqual(live, []);
    const searches = JSON.parse(
      s3.objects
        .get(widgetFileKey('w.example.com', GUID, 'searches.json'))
        .Body.toString('utf8'),
    );
    assert.deepEqual(searches, { queries: [], exclude: [] });
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

describe('FR #3968 pagePartsAclubs + handler', () => {
  it('auto-creates host+guid and returns empty parts page', async () => {
    const s3 = createMemoryS3();
    const page = await pagePartsAclubs({
      host: 'page.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      mint: () =>
        mintChecksummedUserId({
          randomBytes: () => Buffer.from([4, 4, 4, 4, 4, 4, 4]),
        }),
    });
    assert.equal(page.widgetGuid, GUID);
    assert.equal(page.layout, 'horizontal');
    assert.deepEqual(page.parts, []);
    assert.equal(page.nextOffset, null);
    assert.equal(isChecksumValid(page.customerNumber), true);
  });

  it('pages live.json and sets nextOffset', async () => {
    const s3 = createMemoryS3();
    await pagePartsAclubs({
      host: 'live.example.com',
      widgetGuid: GUID,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      mint: () =>
        mintChecksummedUserId({
          randomBytes: () => Buffer.from([5, 5, 5, 5, 5, 5, 5]),
        }),
    });
    const liveKey = widgetFileKey('live.example.com', GUID, 'live.json');
    s3.objects.set(liveKey, {
      Body: Buffer.from(
        JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }], null, 2),
        'utf8',
      ),
      Metadata: {},
    });
    const page = await pagePartsAclubs({
      host: 'live.example.com',
      widgetGuid: GUID,
      offset: 0,
      n: 2,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
    });
    assert.equal(page.parts.length, 2);
    assert.equal(page.nextOffset, 2);
  });

  it('handler returns 403 on Origin mismatch', async () => {
    const s3 = createMemoryS3();
    const res = await handlePartsGateway(
      {
        queryStringParameters: {
          host: 'a.example.com',
          widgetGuid: GUID,
        },
        headers: { origin: 'https://b.example.com' },
      },
      s3,
    );
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).error, 'widget_host_mismatch');
  });

  it('handler returns 400 for invalid GUID and offset', async () => {
    const s3 = createMemoryS3();
    const badGuid = await handlePartsGateway(
      {
        queryStringParameters: { host: 'a.example.com', widgetGuid: 'not-a-guid' },
      },
      s3,
    );
    assert.equal(badGuid.statusCode, 400);
    assert.equal(JSON.parse(badGuid.body).error, 'invalid_widget_guid');

    const badOff = await handlePartsGateway(
      {
        queryStringParameters: {
          host: 'a.example.com',
          widgetGuid: GUID,
          offset: '-1',
        },
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

describe('FR #3968 CDK stack isolation (source pins)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');

  it('parts-gateway stack and bin exist and do not reference ASearchStack', () => {
    const stackPath = path.join(root, 'cdk', 'lib', 'parts-gateway-stack.js');
    const binPath = path.join(root, 'cdk', 'bin', 'parts-gateway.js');
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
    assert.match(stack, /a-clubs/);
    assert.match(stack, /PartsGateway/);
    assert.match(bin, /APartsGateway/);
  });

  it('docs cover standalone deploy', () => {
    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /APartsGateway|parts-gateway/);
    const readme = fs.readFileSync(
      path.join(root, 'cdk', 'README-parts-gateway.md'),
      'utf8',
    );
    assert.match(readme, /parts-gateway/);
  });
});

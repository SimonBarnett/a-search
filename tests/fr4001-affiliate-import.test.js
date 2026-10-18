'use strict';

/**
 * FR #4001: daily affiliate import on redqueen --- acceptance pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const {
  parseAffiliateFeed,
} = require('../redqueen/affiliate-import/src/parseFeed');
const {
  checkSafetyGuard,
} = require('../redqueen/affiliate-import/src/safetyGuard');
const {
  toStagingRows,
  importAffiliateInMemory,
} = require('../redqueen/affiliate-import/src/upsertImport');
const {
  createPartLiveIndex,
} = require('../redqueen/affiliate-import/src/partIndex');
const {
  pruneRemovedPartsFromLiveJson,
} = require('../redqueen/affiliate-import/src/pruneLiveJson');
const {
  listPendingPartsFiles,
} = require('../redqueen/affiliate-import/src/listPending');
const {
  runDailyImport,
} = require('../redqueen/affiliate-import/src/runImport');
const {
  triggerFixingAgent,
  redactCredentialLine,
} = require('../redqueen/affiliate-import/src/triggerAgent');
const { acquireImportLock } = require('../redqueen/affiliate-import/src/lock');
const {
  liveEntryMatchesPart,
  partKeyString,
} = require('../redqueen/affiliate-import/src/partKey');
const { widgetFileKey } = require('../parts-gateway/src/aClubsKeys');

function memoryS3(seed) {
  const objects = new Map(seed || []);
  return {
    objects,
    async listObjectsV2() {
      return {
        Contents: [...objects.keys()].map((Key) => ({
          Key,
          LastModified: new Date('2026-10-01T00:00:00Z'),
        })),
      };
    },
    async getObject({ Key }) {
      if (!objects.has(Key)) {
        const err = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        throw err;
      }
      const v = objects.get(Key);
      if (Buffer.isBuffer(v) || typeof v === 'string') {
        return { Body: Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8'), Metadata: {} };
      }
      return { Body: v.Body, Metadata: v.Metadata || {} };
    },
    async putObject({ Key, Body, Metadata }) {
      objects.set(Key, {
        Body: Buffer.isBuffer(Body) ? Body : Buffer.from(String(Body), 'utf8'),
        Metadata: Metadata || {},
      });
    },
    async deleteObject({ Key }) {
      objects.delete(Key);
    },
  };
}

describe('FR #4001 parse + upsert', () => {
  it('upsert insert and update', () => {
    const parsed = parseAffiliateFeed(
      'partid,title,price\n1,Old,1\n2,Two,2\n',
      { provider: 'awin', affiliateid: '99', format: 'csv' },
    );
    const staging = toStagingRows(parsed);
    let parts = [];
    let r = importAffiliateInMemory({
      parts,
      staging,
      provider: 'awin',
      affiliateid: '99',
    });
    assert.equal(r.inserted, 2);
    parts = r.parts;
    const parsed2 = parseAffiliateFeed(
      'partid,title,price\n1,New,9\n2,Two,2\n',
      { provider: 'awin', affiliateid: '99', format: 'csv' },
    );
    r = importAffiliateInMemory({
      parts,
      staging: toStagingRows(parsed2),
      provider: 'awin',
      affiliateid: '99',
    });
    assert.equal(r.updated, 1);
    const row = r.parts.find((p) => p.MerchantProductId === '1');
    assert.equal(row.Title, 'New');
  });

  it('removal of missing parts', () => {
    const staging1 = toStagingRows(
      parseAffiliateFeed('partid\n1\n2\n3\n', {
        provider: 'awin',
        affiliateid: '1',
        format: 'csv',
      }),
    );
    let parts = importAffiliateInMemory({
      parts: [],
      staging: staging1,
      provider: 'awin',
      affiliateid: '1',
    }).parts;
    const staging2 = toStagingRows(
      parseAffiliateFeed('partid\n1\n3\n', {
        provider: 'awin',
        affiliateid: '1',
        format: 'csv',
      }),
    );
    const r = importAffiliateInMemory({
      parts,
      staging: staging2,
      provider: 'awin',
      affiliateid: '1',
    });
    assert.equal(r.removed, 1);
    assert.ok(r.removedKeys.some((k) => k.includes('2')));
  });

  it('gzip json parse', () => {
    const json = JSON.stringify({ parts: [{ id: 'g1', title: 'G' }] });
    const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
    const rows = parseAffiliateFeed(gz, {
      provider: 'impact',
      affiliateid: 'x',
      format: 'json',
      compression: 'gzip',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].partid, 'g1');
  });
});

describe('FR #4001 safety guard', () => {
  it('empty file fails', () => {
    const g = checkSafetyGuard({
      parsedCount: 0,
      existingActiveCount: 10,
      wouldRemoveCount: 0,
    });
    assert.equal(g.ok, false);
    assert.equal(g.code, 'empty_feed');
  });

  it('more than 50% removed fails', () => {
    assert.throws(
      () =>
        importAffiliateInMemory({
          parts: [
            {
              Source: 'awin',
              FeedKey: '1',
              MerchantProductId: 'a',
              Env: 'live',
            },
            {
              Source: 'awin',
              FeedKey: '1',
              MerchantProductId: 'b',
              Env: 'live',
            },
            {
              Source: 'awin',
              FeedKey: '1',
              MerchantProductId: 'c',
              Env: 'live',
            },
          ],
          staging: toStagingRows(
            parseAffiliateFeed('partid\na\n', {
              provider: 'awin',
              affiliateid: '1',
              format: 'csv',
            }),
          ),
          provider: 'awin',
          affiliateid: '1',
        }),
      (err) => err.code === 'remove_ratio_exceeded',
    );
  });
});

describe('FR #4001 live.json prune', () => {
  it('prunes across several hosts/GUIDs via index', async () => {
    const GUID1 = '11111111-1111-4111-8111-111111111111';
    const GUID2 = '22222222-2222-4222-8222-222222222222';
    const key = { provider: 'awin', affiliateid: '9', partid: 'gone' };
    const ks = partKeyString(key);
    const index = createPartLiveIndex();
    index.add(key, { host: 'a.example.com', guid: GUID1 });
    index.add(key, { host: 'b.example.com', guid: GUID2 });

    const clubs = memoryS3([
      [
        widgetFileKey('a.example.com', GUID1, 'live.json'),
        JSON.stringify([
          { provider: 'awin', affiliateId: '9', partId: 'gone' },
          { provider: 'awin', affiliateId: '9', partId: 'keep' },
        ]),
      ],
      [
        widgetFileKey('b.example.com', GUID2, 'live.json'),
        JSON.stringify([
          { source: 'awin', feedKey: '9', merchantProductId: 'gone' },
        ]),
      ],
    ]);
    const touched = [];
    const r = await pruneRemovedPartsFromLiveJson({
      removedKeys: [ks],
      index,
      getObject: clubs.getObject,
      putObject: clubs.putObject,
      touchLastmod: async (o) => {
        touched.push(o);
      },
    });
    assert.equal(r.prunedEntries, 2);
    const live1 = JSON.parse(
      (
        await clubs.getObject({
          Key: widgetFileKey('a.example.com', GUID1, 'live.json'),
        })
      ).Body.toString('utf8'),
    );
    assert.equal(live1.length, 1);
    assert.equal(live1[0].partId, 'keep');
    assert.ok(touched.some((t) => t.guid === GUID1));
    assert.ok(touched.some((t) => t.host === 'a.example.com' && !t.guid));
  });

  it('liveEntryMatchesPart accepts provider/source aliases', () => {
    const key = { provider: 'awin', affiliateid: '1', partid: 'p' };
    assert.ok(
      liveEntryMatchesPart(
        { source: 'awin', feedKey: '1', id: 'p' },
        key,
      ),
    );
  });
});

describe('FR #4001 run orchestration', () => {
  it('file not deleted on failure; rerun idempotent after fix', async () => {
    const aff = memoryS3([
      [
        'awin/1/parts/2026-10-01.csv',
        Buffer.from('partid,title\n1,One\n', 'utf8'),
      ],
      [
        'awin/1/',
        { Body: Buffer.alloc(0), Metadata: { format: 'csv', compression: 'none' } },
      ],
    ]);
    // existing 4 parts; feed with 1 part would remove 75% -> safety fail
    const parts = ['1', '2', '3', '4'].map((id) => ({
      Source: 'awin',
      FeedKey: '1',
      MerchantProductId: id,
      Env: 'live',
      Title: id,
    }));
    const clubs = memoryS3();
    const r1 = await runDailyImport({
      listAffiliatesObjects: aff.listObjectsV2,
      getAffiliatesObject: aff.getObject,
      deleteAffiliatesObject: aff.deleteObject,
      getClubsObject: clubs.getObject,
      putClubsObject: clubs.putObject,
      touchLastmod: async () => {},
      parts,
      index: createPartLiveIndex(),
      lockPath: path.join(os.tmpdir(), `aff-imp-${process.pid}-a.lock`),
      startGrok: async () => {},
      grokTokensRemaining: 1,
      log: () => {},
    });
    assert.equal(r1.exitCode, 1);
    assert.ok(aff.objects.has('awin/1/parts/2026-10-01.csv'));

    // fix feed to keep all 4
    aff.objects.set(
      'awin/1/parts/2026-10-01.csv',
      Buffer.from('partid,title\n1,One\n2,Two\n3,Three\n4,Four\n', 'utf8'),
    );
    const r2 = await runDailyImport({
      listAffiliatesObjects: aff.listObjectsV2,
      getAffiliatesObject: aff.getObject,
      deleteAffiliatesObject: aff.deleteObject,
      getClubsObject: clubs.getObject,
      putClubsObject: clubs.putObject,
      touchLastmod: async () => {},
      parts,
      index: createPartLiveIndex(),
      lockPath: path.join(os.tmpdir(), `aff-imp-${process.pid}-b.lock`),
      log: () => {},
    });
    assert.equal(r2.exitCode, 0);
    assert.ok(!aff.objects.has('awin/1/parts/2026-10-01.csv'));
  });

  it('one affiliate failing while others carry on', async () => {
    const aff = memoryS3([
      [
        'awin/bad/parts/2026-10-01.csv',
        Buffer.from('partid\n', 'utf8'), // empty parts -> fail
      ],
      [
        'awin/bad/',
        { Body: Buffer.alloc(0), Metadata: { format: 'csv' } },
      ],
      [
        'awin/good/parts/2026-10-01.csv',
        Buffer.from('partid,title\n10,Ten\n', 'utf8'),
      ],
      [
        'awin/good/',
        { Body: Buffer.alloc(0), Metadata: { format: 'csv' } },
      ],
    ]);
    const clubs = memoryS3();
    const r = await runDailyImport({
      listAffiliatesObjects: aff.listObjectsV2,
      getAffiliatesObject: aff.getObject,
      deleteAffiliatesObject: aff.deleteObject,
      getClubsObject: clubs.getObject,
      putClubsObject: clubs.putObject,
      touchLastmod: async () => {},
      parts: [],
      index: createPartLiveIndex(),
      lockPath: path.join(os.tmpdir(), `aff-imp-${process.pid}-c.lock`),
      startGrok: async () => {},
      grokTokensRemaining: 1,
      log: () => {},
    });
    assert.equal(r.exitCode, 1);
    assert.equal(r.processed, 1);
    assert.equal(r.failed.length, 1);
    assert.ok(aff.objects.has('awin/bad/parts/2026-10-01.csv'));
    assert.ok(!aff.objects.has('awin/good/parts/2026-10-01.csv'));
  });

  it('agent triggered on failure (mocked)', async () => {
    const starts = [];
    await triggerFixingAgent({
      provider: 'awin',
      affiliateid: '1',
      fileKey: 'awin/1/parts/2026-10-01.csv',
      reason: 'empty_feed',
      grokTokensRemaining: 0,
      startGrok: async () => {
        starts.push('grok');
      },
      startCursor: async (brief) => {
        starts.push('cursor');
        assert.equal(brief.fr, '#4001');
        assert.ok(!JSON.stringify(brief).includes('password'));
      },
    });
    assert.deepEqual(starts, ['cursor']);
  });

  it('no credentials in logs', () => {
    const line = redactCredentialLine(
      'login password=supersecret apitoken=tok_abc Bearer abc.def.ghi',
    );
    assert.doesNotMatch(line, /supersecret/);
    assert.doesNotMatch(line, /tok_abc/);
    assert.match(line, /\*\*\*/);
  });

  it('lists pending oldest first and skips latest', async () => {
    const aff = memoryS3([
      ['awin/1/parts/2026-10-02.csv', Buffer.from('x')],
      ['awin/1/parts/2026-10-01.csv', Buffer.from('x')],
      ['awin/1/parts/latest.csv', Buffer.from('x')],
    ]);
    const list = await listPendingPartsFiles({
      listObjectsV2: aff.listObjectsV2,
    });
    assert.deepEqual(
      list.map((x) => x.key),
      ['awin/1/parts/2026-10-01.csv', 'awin/1/parts/2026-10-02.csv'],
    );
  });

  it('lock prevents overlap', () => {
    const p = path.join(os.tmpdir(), `aff-imp-lock-${process.pid}.lock`);
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore
    }
    const a = acquireImportLock(p, { pid: 1, now: () => 1000 });
    assert.equal(a.ok, true);
    const b = acquireImportLock(p, { pid: 2, now: () => 1001 });
    assert.equal(b.ok, false);
    a.release();
  });
});

describe('FR #4001 docs + install', () => {
  it('docs and install script present ASCII', () => {
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs/redqueen-affiliate-import.md'),
    );
    assert.notEqual(docs[0], 0xef);
    const text = docs.toString('utf8');
    assert.match(text, /FR #4001|FR \#4001|#4001/);
    assert.match(text, /03:30/);
    assert.match(text, /PartLiveIndex|live\.json/);
    assert.match(text, /#3987/);
    assert.match(text, /#3999/);
    const install = fs.readFileSync(
      path.join(
        ROOT,
        'redqueen/affiliate-import/install/Register-AffiliateImportTask.ps1',
      ),
      'utf8',
    );
    assert.match(install, /a-search-affiliate-import/);
    assert.match(install, /03:30/);
  });

  it('nothing to do exits 0', async () => {
    const aff = memoryS3();
    const r = await runDailyImport({
      listAffiliatesObjects: aff.listObjectsV2,
      getAffiliatesObject: aff.getObject,
      deleteAffiliatesObject: aff.deleteObject,
      getClubsObject: async () => {
        throw new Error('no');
      },
      putClubsObject: async () => {},
      touchLastmod: async () => {},
      parts: [],
      lockPath: path.join(os.tmpdir(), `aff-imp-${process.pid}-empty.lock`),
      log: () => {},
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.code, 'nothing_to_do');
  });
});

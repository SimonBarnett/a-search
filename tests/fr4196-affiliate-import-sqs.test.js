'use strict';

/**
 * FR #4196: download finishes -> import SQS; drain imports flat keys;
 * already-decompressed CSV with marker compression=gzip; fix agent lock + exit.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const {
  listPendingFeedFiles,
  matchFeedKey,
  shouldIgnoreKey,
} = require('../redqueen/affiliate-import/src/listPending');
const {
  parseAffiliateFeed,
  isAlreadyDecompressed,
  decompress,
} = require('../redqueen/affiliate-import/src/parseFeed');
const {
  enqueueImportAfterDownload,
  buildImportMessage,
  normalizeImportFiles,
} = require('../redqueen/affiliate-import/src/enqueueImport');
const {
  drainImportOnce,
  parseImportMessageBody,
  sortFilesOldestFirst,
} = require('../redqueen/affiliate-import/src/drainImport');
const {
  processOneFile,
} = require('../redqueen/affiliate-import/src/runImport');
const {
  createImportLogStore,
} = require('../redqueen/affiliate-import/src/importLog');
const {
  runFixAgent,
  appendSkillsLesson,
} = require('../redqueen/affiliate-import/src/fixAgent');
const { createPartLiveIndex } = require('../redqueen/affiliate-import/src/partIndex');
const { feedDatedKey } = require('../shared/affiliates/keys');

function memoryS3(seed) {
  const objects = new Map(seed || []);
  return {
    objects,
    async listObjectsV2() {
      return {
        Contents: [...objects.keys()].map((Key) => ({
          Key,
          LastModified: new Date('2026-10-01T00:00:00Z'),
          ETag: '"etag1"',
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
        return {
          Body: Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8'),
          Metadata: {},
          ETag: '"etag1"',
        };
      }
      return {
        Body: v.Body,
        Metadata: v.Metadata || {},
        ETag: v.ETag || '"etag1"',
      };
    },
    async headObject({ Key }) {
      if (!objects.has(Key)) {
        const err = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        throw err;
      }
      return { ETag: '"etag1"' };
    },
    async putObject({ Key, Body, Metadata }) {
      objects.set(Key, {
        Body: Buffer.isBuffer(Body) ? Body : Buffer.from(String(Body), 'utf8'),
        Metadata: Metadata || {},
        ETag: '"etag1"',
      });
    },
    async deleteObject({ Key }) {
      objects.delete(Key);
    },
  };
}

describe('FR #4196 listPending flat + ignore', () => {
  it('matches flat and parts; ignores AGENT/SKILLS/_invites/latest', async () => {
    assert.equal(shouldIgnoreKey('awin/1902/AGENT.md'), true);
    assert.equal(shouldIgnoreKey('awin/1902/SKILLS.md'), true);
    assert.equal(shouldIgnoreKey('awin/1902/_invites/x'), true);
    assert.ok(matchFeedKey('awin/1902/2026-10-18.csv'));
    assert.equal(matchFeedKey('awin/1902/2026-10-18.csv').layout, 'flat');
    assert.equal(matchFeedKey('awin/1902/parts/2026-10-01.csv').layout, 'parts');

    const aff = memoryS3([
      ['awin/1902/2026-10-18.csv', Buffer.from('x')],
      ['awin/1902/parts/2026-10-01.csv', Buffer.from('x')],
      ['awin/1902/parts/latest.csv', Buffer.from('x')],
      ['awin/1902/AGENT.md', Buffer.from('x')],
      ['awin/1902/SKILLS.md', Buffer.from('x')],
      ['awin/1902/', { Body: Buffer.alloc(0), Metadata: {} }],
    ]);
    const list = await listPendingFeedFiles({
      listObjectsV2: (...a) => aff.listObjectsV2(...a),
    });
    assert.deepEqual(
      list.map((x) => x.key),
      ['awin/1902/parts/2026-10-01.csv', 'awin/1902/2026-10-18.csv'],
    );
  });

  it('feedDatedKey builds flat path', () => {
    assert.equal(
      feedDatedKey('awin', '1902', '2026-10-18', 'csv'),
      'awin/1902/2026-10-18.csv',
    );
  });
});

describe('FR #4196 already-decompressed flat feed', () => {
  it('plain CSV with marker compression=gzip does not gunzip', () => {
    const csv = 'partid,title\n1,One\n';
    assert.equal(
      isAlreadyDecompressed('awin/1902/2026-10-18.csv', {
        compression: 'gzip',
      }),
      true,
    );
    const rows = parseAffiliateFeed(csv, {
      provider: 'awin',
      affiliateid: '1902',
      format: 'csv',
      compression: 'gzip',
      key: 'awin/1902/2026-10-18.csv',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].partid, '1');
    assert.equal(rows[0].Title, 'One');
  });

  it('legacy parts/*.gz still gunzips', () => {
    const csv = 'partid,title\n2,Two\n';
    const gz = zlib.gzipSync(Buffer.from(csv, 'utf8'));
    const rows = parseAffiliateFeed(gz, {
      provider: 'awin',
      affiliateid: '1',
      format: 'csv',
      compression: 'gzip',
      key: 'awin/1/parts/2026-10-01.csv.gz',
    });
    assert.equal(rows.length, 1);
  });

  it('decompress helper respects flat key', () => {
    const plain = Buffer.from('not-gzip', 'utf8');
    const out = decompress(plain, {
      compression: 'gzip',
      key: 'awin/1/2026-10-18.csv',
    });
    assert.equal(out.toString('utf8'), 'not-gzip');
  });
});

describe('FR #4196 enqueue after download', () => {
  it('N files -> one message; empty -> none; notify fired', async () => {
    const sent = [];
    const notifies = [];
    const files = [
      { provider: 'awin', affiliateid: '1902', key: 'awin/1902/2026-10-18.csv' },
      { provider: 'awin', affiliateid: '1903', key: 'awin/1903/2026-10-18.csv' },
    ];
    const r = await enqueueImportAfterDownload({
      files,
      queueUrl: 'https://sqs.example/import',
      sendMessage: async (input) => {
        sent.push(input);
      },
      notifyUrl: 'https://example/notify',
      fetchImpl: async (url, init) => {
        notifies.push({ url, body: JSON.parse(init.body) });
        return { ok: true };
      },
    });
    assert.equal(r.sent, true);
    assert.equal(sent.length, 1);
    const body = JSON.parse(sent[0].MessageBody);
    assert.equal(body.kind, 'affiliate-import');
    assert.equal(body.files.length, 2);
    assert.equal(r.notified, true);
    assert.equal(notifies.length, 1);

    const empty = await enqueueImportAfterDownload({
      files: [],
      queueUrl: 'https://sqs.example/import',
      sendMessage: async () => {
        throw new Error('should not send');
      },
    });
    assert.equal(empty.sent, false);
    assert.equal(empty.skipped, 'empty');
  });

  it('normalizeImportFiles dedupes and sorts', () => {
    const n = normalizeImportFiles([
      { provider: 'awin', affiliateId: '2', key: 'awin/2/2026-10-18.csv' },
      { provider: 'awin', affiliateid: '1', key: 'awin/1/2026-10-18.csv' },
      { provider: 'awin', affiliateid: '1', key: 'awin/1/2026-10-18.csv' },
    ]);
    assert.deepEqual(
      n.map((x) => x.key),
      ['awin/1/2026-10-18.csv', 'awin/2/2026-10-18.csv'],
    );
    const msg = buildImportMessage({ files: n, at: '2026-10-18T12:00:00Z' });
    assert.equal(msg.at, '2026-10-18T12:00:00Z');
    assert.ok(msg.runId);
  });
});

describe('FR #4196 drain + idempotent log + delete on commit', () => {
  it('import commits -> S3 deleted + lastimportstatus=ok; replay no-op', async () => {
    const csv = 'partid,title,price\n1,One,1\n';
    const aff = memoryS3([
      [
        'awin/1/2026-10-18.csv',
        { Body: Buffer.from(csv), Metadata: { format: 'csv', compression: 'gzip' }, ETag: '"e1"' },
      ],
      [
        'awin/1/',
        { Body: Buffer.alloc(0), Metadata: { format: 'csv', compression: 'gzip', enabled: '1' } },
      ],
    ]);
    const patches = [];
    const importLog = createImportLogStore();
    const one = await processOneFile(
      { provider: 'awin', affiliateid: '1', key: 'awin/1/2026-10-18.csv', etag: 'e1' },
      {
        getAffiliatesObject: (...a) => aff.getObject(...a),
        deleteAffiliatesObject: (...a) => aff.deleteObject(...a),
        getClubsObject: async () => ({ Body: Buffer.from('[]') }),
        putClubsObject: async () => {},
        touchLastmod: async () => {},
        parts: [],
        index: createPartLiveIndex(),
        importLog,
        updateAffiliateMeta: async ({ patch }) => {
          patches.push(patch);
        },
      },
    );
    assert.equal(one.ok, true);
    assert.equal(aff.objects.has('awin/1/2026-10-18.csv'), false);
    assert.equal(patches.at(-1).lastimportstatus, 'ok');
    assert.equal(importLog.has('awin/1/2026-10-18.csv', 'e1'), true);

    const replay = await processOneFile(
      { provider: 'awin', affiliateid: '1', key: 'awin/1/2026-10-18.csv', etag: 'e1' },
      {
        getAffiliatesObject: (...a) => aff.getObject(...a),
        deleteAffiliatesObject: (...a) => aff.deleteObject(...a),
        parts: [],
        index: createPartLiveIndex(),
        importLog,
      },
    );
    assert.equal(replay.ok, true);
    assert.equal(replay.code, 'already_imported');
  });

  it('failure keeps file and stamps lastimportstatus', async () => {
    const aff = memoryS3([
      [
        'awin/bad/2026-10-18.csv',
        { Body: Buffer.from('not,a,feed\nx\n'), Metadata: { format: 'csv', compression: 'none' } },
      ],
      [
        'awin/bad/',
        { Body: Buffer.alloc(0), Metadata: { format: 'csv', compression: 'none', enabled: '1' } },
      ],
    ]);
    const patches = [];
    const one = await processOneFile(
      { provider: 'awin', affiliateid: 'bad', key: 'awin/bad/2026-10-18.csv' },
      {
        getAffiliatesObject: (...a) => aff.getObject(...a),
        deleteAffiliatesObject: (...a) => aff.deleteObject(...a),
        parts: [],
        index: createPartLiveIndex(),
        updateAffiliateMeta: async ({ patch }) => {
          patches.push(patch);
        },
      },
    );
    assert.equal(one.ok, false);
    assert.ok(aff.objects.has('awin/bad/2026-10-18.csv'));
    assert.ok(patches.length);
    assert.notEqual(patches.at(-1).lastimportstatus, 'ok');
  });

  it('drainImportOnce processes message oldest-first and deletes SQS msg', async () => {
    const csv = 'partid,title\n1,A\n';
    const aff = memoryS3([
      [
        'awin/1/2026-10-01.csv',
        { Body: Buffer.from(csv), Metadata: { format: 'csv', compression: 'none' } },
      ],
      [
        'awin/1/2026-10-18.csv',
        { Body: Buffer.from(csv), Metadata: { format: 'csv', compression: 'none' } },
      ],
      [
        'awin/1/',
        { Body: Buffer.alloc(0), Metadata: { format: 'csv', compression: 'none', enabled: '1' } },
      ],
    ]);
    const deleted = [];
    const body = JSON.stringify({
      kind: 'affiliate-import',
      runId: 'r1',
      files: [
        { provider: 'awin', affiliateid: '1', key: 'awin/1/2026-10-18.csv' },
        { provider: 'awin', affiliateid: '1', key: 'awin/1/2026-10-01.csv' },
      ],
    });
    const order = [];
    const r = await drainImportOnce({
      queueUrl: 'https://sqs.example/import',
      receiveMessage: async () => ({
        Messages: [{ MessageId: 'm1', ReceiptHandle: 'rh1', Body: body }],
      }),
      deleteMessage: async (input) => {
        deleted.push(input.ReceiptHandle);
      },
      headObject: (...a) => aff.headObject(...a),
      getAffiliatesObject: async (input) => {
        order.push(input.Key);
        return aff.getObject(input);
      },
      deleteAffiliatesObject: (...a) => aff.deleteObject(...a),
      getClubsObject: async () => ({ Body: Buffer.from('[]') }),
      putClubsObject: async () => {},
      parts: [],
      index: createPartLiveIndex(),
      startFixAgent: false,
    });
    assert.equal(r.processed, 2);
    assert.deepEqual(deleted, ['rh1']);
    assert.ok(order.indexOf('awin/1/2026-10-01.csv') < order.indexOf('awin/1/2026-10-18.csv'));
    assert.equal(aff.objects.has('awin/1/2026-10-01.csv'), false);
  });
});

describe('FR #4196 fix agent self-close + lock', () => {
  it('exactly one agent per file: second call lock_held', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4196-lock-'));
    const lockPath = path.join(dir, 'fix.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 1, ts: Date.now() }));
    const r = await runFixAgent({
      provider: 'awin',
      affiliateid: '1',
      fileKey: 'awin/1/2026-10-18.csv',
      etag: 'e1',
      reason: 'parse_failed',
      lockPath,
      reimport: async () => ({ ok: true }),
    });
    assert.equal(r.lockedOut, true);
    assert.equal(r.code, 'lock_held');
  });

  it('successful reimport exits 0 and appends SKILLS', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4196-fix-'));
    const skills = path.join(dir, 'SKILLS.md');
    const markers = [];
    let attempts = 0;
    const r = await runFixAgent({
      provider: 'awin',
      affiliateid: '1',
      fileKey: 'awin/1/2026-10-18.csv',
      etag: 'e2',
      reason: 'parse_failed',
      lockPath: path.join(dir, 'ok.lock'),
      reimport: async () => {
        attempts += 1;
        return { ok: true };
      },
      writeSkills: async (lesson) => {
        appendSkillsLesson(skills, lesson);
      },
      updateMarker: async (patch) => {
        markers.push(patch);
      },
      startGrok: async () => {},
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.code, 'fixed');
    assert.equal(attempts, 1);
    assert.ok(fs.readFileSync(skills, 'utf8').includes('affiliate-import fix'));
    assert.equal(markers.at(-1).lastimportstatus, 'ok');
  });

  it('3 failed attempts -> needs_fix, one bug, non-zero exit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4196-need-'));
    const bugs = [];
    const notifies = [];
    const r = await runFixAgent({
      provider: 'awin',
      affiliateid: '1',
      fileKey: 'awin/1/2026-10-18.csv',
      etag: 'e3',
      reason: 'code_bug',
      lockPath: path.join(dir, 'need.lock'),
      maxAttempts: 3,
      reimport: async () => ({ ok: false, code: 'still_bad' }),
      fileBug: async (opts) => {
        bugs.push(opts);
        return { created: bugs.length === 1, number: 999 };
      },
      notifySimon: async (t) => {
        notifies.push(t);
      },
      updateMarker: async () => {},
      startGrok: async () => {},
    });
    assert.equal(r.exitCode, 1);
    assert.equal(r.code, 'needs_fix');
    assert.equal(r.attempts, 3);
    assert.equal(bugs.length, 1);
    assert.equal(notifies.length, 1);
  });
});

describe('FR #4196 docs + SQL + CDK pins', () => {
  it('docs and SQL and CDK mention affiliate import queue', () => {
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs/redqueen-affiliate-import.md'),
      'utf8',
    );
    assert.match(docs, /4196|#4196|affiliate-import|lastimportstatus/);
    const sql = fs.readFileSync(
      path.join(ROOT, 'redqueen/affiliate-import/sql/002_ImportLog.sql'),
      'utf8',
    );
    assert.match(sql, /AffiliateImportLog/);
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk/lib/affiliates-stack.js'),
      'utf8',
    );
    assert.match(stack, /a-search-affiliate-import/);
    assert.match(stack, /A_SEARCH_AFFILIATE_IMPORT_QUEUE_URL/);
  });

  it('parseImportMessageBody + sortFilesOldestFirst', () => {
    const p = parseImportMessageBody(
      JSON.stringify({
        kind: 'affiliate-import',
        files: [
          { key: 'awin/1/2026-10-18.csv' },
          { key: 'awin/1/2026-10-01.csv' },
        ],
      }),
    );
    assert.equal(p.kind, 'affiliate-import');
    const sorted = sortFilesOldestFirst(p.files);
    assert.equal(sorted[0].key, 'awin/1/2026-10-01.csv');
  });
});

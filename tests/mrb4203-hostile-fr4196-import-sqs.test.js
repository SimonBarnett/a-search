'use strict';

/**
 * MRB #4203 hostile pins for FR #4196 affiliate import SQS + fix agent.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeImportFiles,
  buildImportMessage,
  enqueueImportAfterDownload,
} = require('../redqueen/affiliate-import/src/enqueueImport');

describe('MRB #4203 hostile FR #4196', () => {
  it('normalizeImportFiles drops feedurl/secrets; message body has only provider affiliateid key', () => {
    const n = normalizeImportFiles([
      {
        provider: 'awin',
        affiliateid: '1902',
        key: 'awin/1902/2026-10-18.csv',
        feedurl: 'https://example.test/feed?key=SECRETLEAK',
        password: 'pw',
        api_key: 'k',
      },
    ]);
    assert.deepEqual(n, [
      {
        provider: 'awin',
        affiliateid: '1902',
        key: 'awin/1902/2026-10-18.csv',
      },
    ]);
    const msg = buildImportMessage({ files: n, at: '2026-10-18T12:00:00Z' });
    const text = JSON.stringify(msg);
    assert.ok(!text.includes('SECRETLEAK'));
    assert.ok(!text.includes('feedurl'));
    assert.ok(!text.includes('password'));
    assert.ok(!text.includes('api_key'));
  });

  it('enqueue notify body has no file keys or secrets', async () => {
    const notifies = [];
    await enqueueImportAfterDownload({
      files: [
        {
          provider: 'awin',
          affiliateid: '1',
          key: 'awin/1/2026-10-18.csv',
          feedurl: 'https://example.test/SECRET',
        },
      ],
      queueUrl: 'https://sqs.example/import',
      sendMessage: async () => {},
      notifyUrl: 'https://example/wake',
      fetchImpl: async (_u, init) => {
        notifies.push(JSON.parse(init.body));
        return { ok: true };
      },
    });
    assert.equal(notifies.length, 1);
    const t = JSON.stringify(notifies[0]);
    assert.equal(notifies[0].kind, 'affiliate-import-wake');
    assert.ok(!t.includes('awin/1/'));
    assert.ok(!t.includes('SECRET'));
    assert.ok(!t.includes('feedurl'));
  });

  it('fixAgent and enqueue sources forbid madeiradb and keep no-secret contract', () => {
    const root = path.join(__dirname, '..');
    const fix = fs.readFileSync(
      path.join(root, 'redqueen', 'affiliate-import', 'src', 'fixAgent.js'),
      'utf8',
    );
    const enq = fs.readFileSync(
      path.join(root, 'redqueen', 'affiliate-import', 'src', 'enqueueImport.js'),
      'utf8',
    );
    assert.match(fix, /never.*madeiradb|never touches madeiradb/i);
    assert.match(enq, /Never put secrets|no secrets/i);
    assert.equal(/\bmadeiradb\b/.test(enq), false);
  });

  it('folderDownloadOne wires enqueueImportAfterDownload; downloadOne exposes datedKey', () => {
    const root = path.join(__dirname, '..');
    const folder = fs.readFileSync(
      path.join(root, 'affiliates', 'src', 'folderDownloadOne.js'),
      'utf8',
    );
    const one = fs.readFileSync(
      path.join(root, 'affiliates', 'src', 'downloadOne.js'),
      'utf8',
    );
    assert.match(folder, /enqueueImportAfterDownload/);
    assert.match(one, /datedKey/);
  });
});

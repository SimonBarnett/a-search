'use strict';

/**
 * FR #4918: deterministic hasresults monitor on redqueen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const {
  hasResultsReady,
  listHasresultsMarkers,
  processHasresultsGuid,
  runHasresultsMonitorPass,
  shouldSkipMonitorChangeEvent,
  buildHasresultsAgentBrief,
} = require('../redqueen/src/hasresultsMonitor');
const { clearHasResults } = require('../shared/widgets/hostFolderMeta');
const {
  runHasresultsAgentWork,
  listInObjectKeys,
} = require('../shared/widgets/promoteInToLive');
const { isExcludedKey } = require('../shared/aClubs/changeEvents');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function memoryS3(seed = {}) {
  /** @type {Map<string, { Body?: Buffer, Metadata?: Record<string,string>, ETag?: string }>} */
  const objects = new Map();
  for (const [k, v] of Object.entries(seed)) {
    objects.set(k, {
      Body: Buffer.from(v.Body != null ? v.Body : '', 'utf8'),
      Metadata: { ...(v.Metadata || {}) },
      ETag: v.ETag || `"etag-${k}"`,
    });
  }
  return {
    objects,
    async listObjectsV2({ Prefix, ContinuationToken } = {}) {
      void ContinuationToken;
      const Contents = [];
      for (const Key of objects.keys()) {
        if (!Prefix || Key.startsWith(Prefix)) Contents.push({ Key });
      }
      return { Contents, IsTruncated: false };
    },
    async headObject({ Key }) {
      const o = objects.get(Key);
      if (!o) {
        const err = new Error('NoSuchKey');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Metadata: { ...o.Metadata }, ETag: o.ETag };
    },
    async getObject({ Key }) {
      const o = objects.get(Key);
      if (!o) {
        const err = new Error('NoSuchKey');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Body: o.Body, Metadata: { ...o.Metadata }, ETag: o.ETag };
    },
    async putObject({ Key, Body, Metadata }) {
      const buf = Buffer.isBuffer(Body) ? Body : Buffer.from(String(Body || ''), 'utf8');
      const ETag = `"put-${Key}-${buf.length}"`;
      objects.set(Key, {
        Body: buf,
        Metadata: { ...(Metadata || {}) },
        ETag,
      });
      return { ETag };
    },
    async copyObject({ Key, Metadata }) {
      const prev = objects.get(Key) || { Body: Buffer.alloc(0), Metadata: {} };
      const ETag = `"copy-${Key}-${Date.now()}"`;
      objects.set(Key, {
        Body: prev.Body,
        Metadata: { ...(Metadata || prev.Metadata) },
        ETag,
      });
      return { CopyObjectResult: { ETag }, ETag };
    },
    async deleteObject({ Key }) {
      objects.delete(Key);
      return {};
    },
  };
}

describe('FR #4918 hasresults selection', () => {
  it('hasResultsReady only when metadata hasresults=1', () => {
    assert.equal(hasResultsReady({ hasresults: '1' }), true);
    assert.equal(hasResultsReady({ hasresults: '0' }), false);
    assert.equal(hasResultsReady({}), false);
  });

  it('listHasresultsMarkers returns only GUID markers with hasresults=1', async () => {
    const s3 = memoryS3({
      'club.example/': { Metadata: { annotated: '1' } },
      'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '1', enabled: '0', host: 'club.example' },
      },
      'club.example/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '0', enabled: '1' },
      },
    });
    const rows = await listHasresultsMarkers(s3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].guid, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(rows[0].hostkey, 'club.example');
  });
});

describe('FR #4918 process + lock + clear', () => {
  it('success: agent liveWritten clears hasresults to 0 and passes cwd', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4918-'));
    const s3 = memoryS3({
      'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '1', enabled: '0' },
      },
    });
    let sawCwd;
    const result = await processHasresultsGuid({
      ...s3,
      host: 'club.example',
      guid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      key: 'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/',
      aClubsRoot: tmp,
      lockDir: path.join(tmp, 'locks'),
      async runAgent(opts) {
        sawCwd = opts.cwd;
        assert.equal(
          opts.cwd,
          path.join(tmp, 'club.example', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
        );
        return { exitCode: 0, liveWritten: true };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.hasresults, 0);
    assert.ok(sawCwd);
    const head = await s3.headObject({
      Key: 'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/',
    });
    assert.equal(head.Metadata.hasresults, '0');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('failure: leaves hasresults=1 and does not clear', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4918-'));
    const s3 = memoryS3({
      'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '1', enabled: '0' },
      },
    });
    const result = await processHasresultsGuid({
      ...s3,
      host: 'club.example',
      guid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      key: 'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/',
      lockDir: path.join(tmp, 'locks'),
      async runAgent() {
        return { exitCode: 1, liveWritten: false };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.hasresults, 1);
    const head = await s3.headObject({
      Key: 'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/',
    });
    assert.equal(head.Metadata.hasresults, '1');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lock prevents double launches for the same GUID', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4918-'));
    const lockDir = path.join(tmp, 'locks');
    const s3 = memoryS3({
      'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '1' },
      },
    });
    let started = 0;
    const guid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const key = `club.example/${guid}/`;
    const p1 = processHasresultsGuid({
      ...s3,
      host: 'club.example',
      guid,
      key,
      lockDir,
      async runAgent() {
        started += 1;
        await new Promise((r) => setTimeout(r, 80));
        return { exitCode: 0, liveWritten: true };
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    const p2 = await processHasresultsGuid({
      ...s3,
      host: 'club.example',
      guid,
      key,
      lockDir,
      async runAgent() {
        started += 1;
        return { exitCode: 0, liveWritten: true };
      },
    });
    const r1 = await p1;
    assert.equal(r1.ok, true);
    assert.equal(p2.ok, false);
    assert.equal(p2.code, 'lock_held');
    assert.equal(started, 1);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('FR #4918 agent work delete IN + no hasresults write', () => {
  it('happy path: promote, delete processed IN keys, does not touch hasresults', async () => {
    const guid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const host = 'club.example';
    const marker = `${host}/${guid}/`;
    const inKey = `${host}/${guid}/IN/sql.json`;
    const s3 = memoryS3({
      [marker]: { Metadata: { hasresults: '1', enabled: '0' } },
      [inKey]: {
        Body: JSON.stringify([{ Title: 'Bolt', Url: 'https://example/p' }]),
        Metadata: {},
      },
    });
    const result = await runHasresultsAgentWork({
      host,
      guid,
      listObjectsV2: s3.listObjectsV2,
      getObject: s3.getObject,
      putObject: s3.putObject,
      deleteObject: s3.deleteObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
    });
    assert.equal(result.ok, true);
    assert.equal(result.liveWritten, true);
    assert.deepEqual(result.deleted, [inKey]);
    assert.equal(s3.objects.has(inKey), false);
    assert.equal(s3.objects.has(`${host}/${guid}/live.json`), true);
    assert.equal(s3.objects.get(marker).Metadata.hasresults, '1');
    assert.equal(s3.objects.get(marker).Metadata.enabled, '1');
  });

  it('failure before delete leaves IN and hasresults=1', async () => {
    const guid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const host = 'club.example';
    const marker = `${host}/${guid}/`;
    const inKey = `${host}/${guid}/IN/sql.json`;
    const s3 = memoryS3({
      [marker]: { Metadata: { hasresults: '1', enabled: '0' } },
      [inKey]: {
        Body: JSON.stringify([{ Title: 'Nut' }]),
        Metadata: {},
      },
    });
    await assert.rejects(
      () =>
        runHasresultsAgentWork({
          host,
          guid,
          listObjectsV2: s3.listObjectsV2,
          getObject: s3.getObject,
          putObject: s3.putObject,
          deleteObject: s3.deleteObject,
          headObject: s3.headObject,
          copyObject: s3.copyObject,
          failBeforeDelete: true,
        }),
      /agent_fail_before_delete/,
    );
    assert.equal(s3.objects.has(inKey), true);
    assert.equal(s3.objects.get(marker).Metadata.hasresults, '1');
  });

  it('IN file arriving after the processed-key snapshot is kept', async () => {
    const {
      deleteProcessedInFiles,
    } = require('../shared/widgets/promoteInToLive');
    const guid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const host = 'club.example';
    const inKey = `${host}/${guid}/IN/sql.json`;
    const lateKey = `${host}/${guid}/IN/late.json`;
    const s3 = memoryS3({
      [inKey]: {
        Body: JSON.stringify([{ Title: 'Washer' }]),
        Metadata: {},
      },
    });
    const keysBefore = await listInObjectKeys({
      host,
      guid,
      listObjectsV2: s3.listObjectsV2,
    });
    assert.deepEqual(keysBefore, [inKey]);
    s3.objects.set(lateKey, {
      Body: Buffer.from(JSON.stringify([{ Title: 'Late' }]), 'utf8'),
      Metadata: {},
      ETag: '"late"',
    });
    await deleteProcessedInFiles({
      keys: keysBefore,
      deleteObject: s3.deleteObject,
    });
    assert.equal(s3.objects.has(inKey), false);
    assert.equal(s3.objects.has(lateKey), true);
  });
});

describe('FR #4918 changeEvents / self-etag', () => {
  it('IN/ deletes are excluded from annotation change events', () => {
    assert.equal(
      isExcludedKey('club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/sql.json'),
      true,
    );
  });

  it('monitor selfEtag skips re-annotation for cleared marker metadata', async () => {
    const selfEtags = new Map();
    const s3 = memoryS3({
      'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '1', enabled: '1' },
      },
    });
    const cleared = await clearHasResults({
      Key: 'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/',
      copyObject: s3.copyObject,
      headObject: s3.headObject,
      getObject: s3.getObject,
    });
    assert.equal(cleared.hasresults, 0);
    assert.ok(cleared.etag);
    selfEtags.set(cleared.Key, cleared.etag);
    const skip = shouldSkipMonitorChangeEvent(
      {
        detail: {
          object: {
            key: 'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/',
            etag: cleared.etag,
          },
        },
      },
      selfEtags,
    );
    assert.equal(skip, true);
  });
});

describe('FR #4918 wiring pins', () => {
  it('SEA build, install script, and docs name a-hasresults-monitor on redqueen', () => {
    const build = read('scripts/build-a-search-sea.js');
    assert.match(build, /a-hasresults-monitor/);
    assert.match(build, /hasresults-monitor-entry\.js/);

    const entry = read('scripts/sea/hasresults-monitor-entry.js');
    assert.match(entry, /a-hasresults-monitor/);
    assert.match(entry, /hasresultsMonitorMain/);

    const reg = read('redqueen/install/Register-HasresultsMonitorService.ps1');
    assert.match(reg, /a-hasresults-monitor/);
    assert.match(reg, /HASRESULTS_MONITOR_MS/);
    assert.match(reg, /#Requires -Version 5\.1/);

    const docs = read('docs/a-annotator-a-sqlsearch.md');
    assert.match(docs, /a-hasresults-monitor/);
    assert.match(docs, /hasresults/);
    assert.match(docs, /redqueen/i);

    const brief = buildHasresultsAgentBrief({
      host: 'h',
      guid: 'g',
      cwd: 'D:\\s3\\a-clubs\\h\\g',
    });
    assert.equal(brief.fr, '#4918');
    assert.match(brief.rules.join('\n'), /Do not write hasresults/);
  });

  it(
    'Register-HasresultsMonitorService WhatIf parses on Windows',
    { skip: process.platform === 'win32' ? false : 'Windows only' },
    () => {
      const script = path.join(
        ROOT,
        'redqueen',
        'install',
        'Register-HasresultsMonitorService.ps1',
      );
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          script,
          '-WhatIf',
          '-InstallRoot',
          ROOT,
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
      assert.match(r.stdout, /a-hasresults-monitor/);
    },
  );

  it('--version on monitor main exits without AWS', async () => {
    const { main } = require('../redqueen/src/hasresultsMonitorMain');
    const prev = process.argv;
    process.argv = ['node', 'hasresultsMonitorMain.js', '--version'];
    let out = '';
    const orig = process.stdout.write;
    process.stdout.write = (chunk, ...rest) => {
      out += String(chunk);
      return true;
    };
    try {
      await main({ once: true });
    } finally {
      process.stdout.write = orig;
      process.argv = prev;
    }
    assert.match(out, /a-hasresults-monitor /);
  });
});

describe('FR #4918 monitor pass', () => {
  it('runHasresultsMonitorPass processes ready GUIDs only', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4918-pass-'));
    const s3 = memoryS3({
      'club.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '1', enabled: '0' },
      },
      'club.example/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee/': {
        Metadata: { hasresults: '0' },
      },
    });
    const pass = await runHasresultsMonitorPass({
      ...s3,
      aClubsRoot: tmp,
      lockDir: path.join(tmp, 'locks'),
      async runAgent() {
        return { exitCode: 0, liveWritten: true };
      },
    });
    assert.equal(pass.scanned, 1);
    assert.equal(pass.actions[0].ok, true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

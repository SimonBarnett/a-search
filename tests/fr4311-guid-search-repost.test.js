'use strict';

/**
 * FR #4311: annotated GUID with searches.json and no searchid is POSTed once.
 * Reviews are not run again. A failed POST leaves the SQS message (no delete).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { processFolderEvent } = require('../redqueen/src/annotate');
const { drainOnce } = require('../redqueen/src/drain');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOST = 'www.example.test';
const QUERIES = [
  { q: 'trainer kits', intent: 'page', maxResults: 10 },
  { q: 'balsa', intent: 'page', maxResults: 10 },
  { q: 'film', intent: 'page', maxResults: 10 },
];

async function seedAnnotated(s3) {
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
      seen: '0',
      clicks: '0',
      since: stamp,
      lastmod: stamp,
      annotated: '1',
    },
  });
  await s3.putObject({
    Key: `${HOST}/${GUID}/searches.json`,
    Body: Buffer.from(`${JSON.stringify({ queries: QUERIES, exclude: [] })}\n`),
    ContentType: 'application/json',
  });
}

function s3deps(s3, extra) {
  return {
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
    ...extra,
  };
}

describe('FR #4311 repost existing searches.json', () => {
  it('reannotate posts existing queries and does not call reviewers', async () => {
    const s3 = createMemoryS3();
    await seedAnnotated(s3);
    let hostReviews = 0;
    let guidReviews = 0;
    const posts = [];
    const result = await processFolderEvent(
      s3deps(s3, {
        event: { hostkey: HOST, host: HOST, createdAt: 't' },
        reannotate: true,
        reviewHost: async () => {
          hostReviews += 1;
          return { model: 'no', summary: 'should not run' };
        },
        reviewGuid: async () => {
          guidReviews += 1;
          return { model: 'no', summary: 'should not run', intent: 'x', suggestedQueries: ['other'] };
        },
        postSearch: async (body) => {
          posts.push(body);
          return { ok: true, status: 202, searchid: 'srch_repost' };
        },
      }),
    );
    assert.equal(result.action, 'host_processed');
    assert.equal(hostReviews, 0);
    assert.equal(guidReviews, 0);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].queries, QUERIES);
    assert.equal(result.guids[0].detail, 'search_reposted');
    const saved = JSON.parse(
      (await s3.getObject({ Key: `${HOST}/${GUID}/searches.json` })).Body.toString('utf8'),
    );
    assert.equal(saved.searchid, 'srch_repost');
    assert.deepEqual(saved.queries, QUERIES);
  });

  it('failed POST is a guid retry and drainOnce does not delete the message', async () => {
    const s3 = createMemoryS3();
    await seedAnnotated(s3);
    const deleted = [];
    const vis = [];
    const out = await drainOnce({
      ...s3deps(s3, {}),
      queueUrl: 'https://sqs.example.invalid/a-clubs-new-folders.fifo',
      visibilityHeartbeatMs: 0,
      reannotate: true,
      receiveMessage: async () => ({
        Messages: [
          {
            MessageId: 'm1',
            ReceiptHandle: 'rh1',
            Body: JSON.stringify({ hostkey: HOST, host: HOST }),
          },
        ],
      }),
      deleteMessage: async (input) => {
        deleted.push(input);
      },
      changeMessageVisibility: async (input) => {
        vis.push(input);
      },
      reviewHost: async () => {
        throw new Error('review must not run');
      },
      reviewGuid: async () => {
        throw new Error('review must not run');
      },
      postSearch: async () => {
        const err = new Error('search_not_configured');
        err.code = 'search_not_configured';
        throw err;
      },
    });
    assert.equal(deleted.length, 0);
    assert.equal(vis.length, 1);
    assert.equal(out.actions[0].guids[0].action, 'retry');
    assert.equal(out.actions[0].guids[0].detail, 'search_post_failed');
  });
});

describe('FR #4311 nssm search env', () => {
  it('source always resolves the URL and the key-file path', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'redqueen', 'install', 'Register-AClubsQueueService.ps1'),
      'utf8',
    );
    assert.match(src, /\$resolvedSearchApiUrl/);
    assert.match(src, /search-api\.url/);
    assert.match(src, /agent-api\.key/);
    assert.match(src, /A_SEARCH_API_URL=/);
    assert.match(src, /A_SEARCH_AGENT_API_KEY_FILE=/);
    assert.match(src, /searchConfigured:/);
    assert.doesNotMatch(src, /A_SEARCH_AGENT_API_KEY=/);
  });

  it(
    'fake nssm gets the URL and key path, not the key value',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4311-nssm-'));
      const installRoot = path.join(tmp, 'install');
      const runJs = path.join(installRoot, 'redqueen', 'src', 'run.js');
      fs.mkdirSync(path.dirname(runJs), { recursive: true });
      fs.writeFileSync(runJs, '// stub\n', 'utf8');
      const keyFile = path.join(tmp, 'agent-api.key');
      fs.writeFileSync(keyFile, 'FAKE_agent_key_example\n', 'utf8');
      const logPath = path.join(tmp, 'nssm-args.log');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      fs.writeFileSync(
        fakeNssm,
        ['@echo off', `>> "${logPath}" echo %*`, 'exit /b 0', ''].join('\r\n'),
        'utf8',
      );
      const script = path.join(
        __dirname,
        '..',
        'redqueen',
        'install',
        'Register-AClubsQueueService.ps1',
      );
      const url = 'http://127.0.0.1:9';
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script,
          '-InstallRoot',
          installRoot,
          '-ServiceName',
          'a-search-aclubs-queue-fr4311-test',
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-AllowLocalSystem',
          '-SearchApiUrl',
          url,
          '-AgentApiKeyFile',
          keyFile,
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      const log = fs.readFileSync(logPath, 'utf8');
      assert.match(log, new RegExp(`A_SEARCH_API_URL=${url.replace(/[.]/g, '\\.')}`));
      assert.match(log, /A_SEARCH_AGENT_API_KEY_FILE=/);
      assert.doesNotMatch(log, /FAKE_agent_key_example/);
      assert.match(r.stdout || '', /searchConfigured: True/i);
      const saved = fs.readFileSync(
        path.join(installRoot, 'redqueen', 'config', 'search-api.url'),
        'utf8',
      );
      assert.equal(saved.trim(), url);
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  );
});

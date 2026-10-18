'use strict';

/**
 * FR #4147: redqueen must fetch real pages before annotate; failed fetch never
 * annotates; nssm installer dry-run; package.json for clean npm ci.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const {
  processFolderEvent,
  hostAnnotationsKey,
} = require('../redqueen/src/annotate');
const { drainOnce } = require('../redqueen/src/drain');
const { fetchPageText, extractReadableText } = require('../redqueen/src/fetchPage');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FIXED_NOW = () => new Date('2026-10-18T12:00:00.000Z');
const ROOT = path.join(__dirname, '..');

async function seedHostAndGuid(s3, host, guid) {
  const createdAt = '2026-10-18T11:00:00.000Z';
  await s3.putObject({
    Key: hostMarkerKey(host),
    Body: Buffer.alloc(0),
    Metadata: {
      userid: '0123456C',
      host,
      hostkey: host,
      lastmod: createdAt,
      annotated: '0',
    },
  });
  await s3.putObject({
    Key: guidMarkerKey(host, guid),
    Body: Buffer.alloc(0),
    Metadata: {
      uri: '/membersproductrequests',
      seen: '0',
      clicks: '0',
      since: createdAt,
      lastmod: createdAt,
      annotated: '0',
    },
  });
}

function s3Deps(s3, extra = {}) {
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
    now: FIXED_NOW,
    ...extra,
  };
}

describe('FR #4147 fetchPageText', () => {
  it('extractReadableText strips scripts and tags', () => {
    const html =
      '<html><head><script>evil()</script><style>x{}</style></head>' +
      '<body><h1>Club</h1><p>Welcome members</p></body></html>';
    const text = extractReadableText(html);
    assert.match(text, /Club/);
    assert.match(text, /Welcome members/);
    assert.doesNotMatch(text, /evil/);
  });

  it('ok fetch returns capped text', async () => {
    const html = '<html><body><p>Hello flying club</p></body></html>';
    const out = await fetchPageText({
      url: 'https://www.example.com/',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from(html),
      }),
    });
    assert.equal(out.ok, true);
    assert.match(out.text, /Hello flying club/);
  });

  it('non-2xx yields not ok', async () => {
    const out = await fetchPageText({
      url: 'https://www.example.com/',
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        arrayBuffer: async () => Buffer.from('x'),
      }),
    });
    assert.equal(out.ok, false);
    assert.match(out.detail, /http_503/);
  });

  it('timeout / abort yields timeout detail', async () => {
    const out = await fetchPageText({
      url: 'https://www.example.com/',
      timeoutMs: 5,
      fetchImpl: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    });
    assert.equal(out.ok, false);
    assert.equal(out.detail, 'timeout');
  });
});

describe('FR #4147 failed fetch never annotates', () => {
  it('host fetch failure retries without annotated=1 or annotation write', async () => {
    const s3 = createMemoryS3();
    const host = 'fetchfail.example.com';
    await seedHostAndGuid(s3, host, GUID);
    let reviewed = 0;
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        fetchImpl: async () => ({
          ok: false,
          status: 500,
          arrayBuffer: async () => Buffer.from(''),
        }),
        reviewHost: async () => {
          reviewed += 1;
          return { summary: 'should-not-run', model: 'test' };
        },
        reviewGuid: async () => ({ summary: 'no', model: 'test' }),
      }),
    );
    assert.equal(result.action, 'retry');
    assert.match(String(result.detail || ''), /host_fetch_failed/);
    assert.equal(reviewed, 0);
    const head = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.notEqual(String(head.Metadata.annotated || ''), '1');
    assert.equal(s3.objects.has(hostAnnotationsKey(host)), false);
  });

  it('drain leaves message (no delete) when host fetch fails', async () => {
    const s3 = createMemoryS3();
    const host = 'dlqpath.example.com';
    await seedHostAndGuid(s3, host, GUID);
    let deleted = 0;
    let visibility = 0;
    const out = await drainOnce({
      queueUrl: 'https://sqs.example/q',
      receiveMessage: async () => ({
        Messages: [
          {
            MessageId: 'm1',
            ReceiptHandle: 'rh1',
            Body: JSON.stringify({
              hostkey: host,
              host,
              createdAt: '2026-10-18T11:00:00.000Z',
            }),
          },
        ],
      }),
      deleteMessage: async () => {
        deleted += 1;
      },
      changeMessageVisibility: async () => {
        visibility += 1;
      },
      ...s3Deps(s3, {
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          arrayBuffer: async () => Buffer.from('missing'),
        }),
        reviewHost: async () => ({ summary: 'x', model: 'test' }),
        reviewGuid: async () => ({ summary: 'y', model: 'test' }),
      }),
    });
    assert.equal(out.actions[0].action, 'retry');
    assert.equal(deleted, 0);
    assert.equal(visibility, 1);
  });
});

describe('FR #4147 reviewer receives fetched page text', () => {
  it('host and GUID reviewers see pageText from fetch', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seedHostAndGuid(s3, host, GUID);
    const seen = { host: '', guid: '' };
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        fetchImpl: async (url) => {
          const body = String(url).includes('membersproductrequests')
            ? '<html><body><h1>Product requests</h1><p>Member parts form</p></body></html>'
            : '<html><body><h1>My Model Flying Club</h1><p>Club home</p></body></html>';
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => Buffer.from(body),
          };
        },
        reviewHost: async (input) => {
          seen.host = String(input.pageText || '');
          assert.match(seen.host, /My Model Flying Club/);
          return {
            summary: 'Real club site',
            categories: ['club'],
            model: 'test-host',
          };
        },
        reviewGuid: async (input) => {
          seen.guid = String(input.pageText || '');
          assert.match(seen.guid, /Product requests/);
          return {
            summary: 'GUID page',
            intent: 'request',
            suggestedQueries: ['parts'],
            steering: { prefer: 'oem' },
            model: 'test-guid',
          };
        },
      }),
    );
    assert.equal(result.action, 'host_processed');
    assert.equal(result.host, 'annotated');
    assert.equal(result.guids[0].action, 'guid_annotated');
    assert.match(seen.host, /Club home/);
    assert.match(seen.guid, /Member parts form/);
    const hostHead = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.equal(String(hostHead.Metadata.annotated), '1');
  });
});

describe('FR #4147 stub still never annotates', () => {
  it('usable stub review after successful fetch still retries', async () => {
    const s3 = createMemoryS3();
    const host = 'stub.example.com';
    await seedHostAndGuid(s3, host, GUID);
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            Buffer.from('<html><body><p>content</p></body></html>'),
        }),
        reviewHost: async () => ({
          model: 'stub',
          usable: false,
          unavailable: true,
          summary: '',
        }),
        reviewGuid: async () => ({ summary: 'x', model: 'test' }),
      }),
    );
    assert.equal(result.action, 'retry');
    const head = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.notEqual(String(head.Metadata.annotated || ''), '1');
  });
});

describe('FR #4147 nssm installer + package.json', () => {
  it('Register-AClubsQueueService.ps1 dry-run emits nssm commands', () => {
    const ps1 = fs.readFileSync(
      path.join(ROOT, 'redqueen', 'install', 'Register-AClubsQueueService.ps1'),
      'utf8',
    );
    assert.match(ps1, /nssm/i);
    assert.match(ps1, /DryRun|WhatIf/);
    assert.match(ps1, /redqueen\\logs/);
    assert.match(ps1, /AWS_PROFILE/);
    assert.match(ps1, /a-search-redqueen-annotator/);
    assert.match(ps1, /\$NssmArgs/);
    assert.doesNotMatch(ps1, /param\(\[string\]\$Nssm,\s*\[string\[\]\$Args\)/);
    assert.doesNotMatch(ps1, /sc\.exe create/);
  });

  it('redqueen/package.json lists aws sdk runtime deps', () => {
    const pkgPath = path.join(ROOT, 'redqueen', 'package.json');
    assert.equal(fs.existsSync(pkgPath), true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.dependencies['@aws-sdk/client-s3']);
    assert.ok(pkg.dependencies['@aws-sdk/client-sqs']);
    assert.equal(fs.existsSync(path.join(ROOT, 'redqueen', 'package-lock.json')), true);
  });

  it('docs describe fetch-based flow and nssm install', () => {
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(docs, /fetch/i);
    assert.match(docs, /nssm/i);
    assert.match(docs, /redqueen\\logs|redqueen\/logs/);
    assert.doesNotMatch(docs, /annotations\.json\/stub wording|write annotations\.json/);
  });
});

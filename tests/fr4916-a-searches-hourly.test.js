'use strict';

/**
 * FR #4916: a-searches selection, hourly runner, no-creds warn, refresh /search.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { selectDueGuidSearches } = require('../searches/src/selectDue');
const { runHourlySearches } = require('../searches/src/runHourly');
const { createPostSearchRunner } = require('../searches/src/postSearch');
const { handleAgentSearch } = require('../entry/src/agentSearch');
const { isDueByLastSearch } = require('../shared/defaultAge');

const ROOT = path.join(__dirname, '..');
const NOW = new Date('2026-10-25T12:00:00.000Z');
const GUID = '11111111-1111-4111-8111-111111111111';
const FAKE_KEY = ['FAKE', '_AGENT_', 'KEY_NOT_A_SECRET'].join('');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function createMemoryS3(seed) {
  const store = new Map(seed || []);
  return {
    store,
    async headObject({ Key }) {
      const o = store.get(Key);
      if (!o) {
        const err = new Error('NoSuchKey');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Metadata: { ...(o.Metadata || {}) } };
    },
    async listObjectsV2({ Prefix, Delimiter, ContinuationToken }) {
      const pref = Prefix || '';
      const delim = Delimiter || '';
      const keys = [...store.keys()].filter((k) => k.startsWith(pref));
      const prefixes = new Set();
      const contents = [];
      for (const k of keys) {
        const rest = k.slice(pref.length);
        if (delim && rest.includes(delim)) {
          prefixes.add(pref + rest.split(delim)[0] + delim);
        } else if (!ContinuationToken) {
          contents.push({ Key: k });
        }
      }
      return {
        CommonPrefixes: [...prefixes].sort().map((Prefix) => ({ Prefix })),
        Contents: contents,
        IsTruncated: false,
      };
    },
    async getObject({ Key }) {
      const o = store.get(Key);
      if (!o || o.Body == null) {
        const err = new Error('NoSuchKey');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Body: Buffer.isBuffer(o.Body) ? o.Body : Buffer.from(String(o.Body)) };
    },
    async putObject({ Key, Body, Metadata, IfNoneMatch }) {
      if (IfNoneMatch === '*' && store.has(Key)) {
        const err = new Error('PreconditionFailed');
        err.name = 'PreconditionFailed';
        err.$metadata = { httpStatusCode: 412 };
        throw err;
      }
      store.set(Key, {
        Body: Body == null ? '' : Body,
        Metadata: { ...(Metadata || {}) },
      });
      return {};
    },
  };
}

describe('FR #4916 isDueByLastSearch', () => {
  it('empty lastsearch is due; age gate uses days', () => {
    assert.equal(isDueByLastSearch({}, NOW, 7), true);
    assert.equal(
      isDueByLastSearch({ lastsearch: '2026-10-20T12:00:00.000Z' }, NOW, 7),
      false,
    );
    assert.equal(
      isDueByLastSearch({ lastsearch: '2026-10-18T12:00:00.000Z' }, NOW, 7),
      true,
    );
  });
});

describe('FR #4916 selectDueGuidSearches', () => {
  it('selects GUID due by fan-out at when lastsearch missing', async () => {
    const host = 'club.example';
    const s3 = createMemoryS3([
      [
        '_root/',
        { Metadata: { defaultage: '7', name: 'a-clubs', kind: 'root' } },
      ],
      [
        `${host}/`,
        { Metadata: { annotated: '1', enabled: '1', userid: 'u1' } },
      ],
      [
        `${host}/${GUID}/`,
        { Metadata: { annotated: '1', enabled: '1' } },
      ],
      [
        `${host}/${GUID}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'boots', intent: 'shop', maxResults: 10 }],
            exclude: [],
          }),
        },
      ],
      [
        `${host}/${GUID}/search-fanout.json`,
        {
          Body: JSON.stringify({
            searchid: 'srch_old',
            queued: ['ebay'],
            at: '2026-10-01T12:00:00.000Z',
          }),
        },
      ],
    ]);
    const out = await selectDueGuidSearches(s3, 'a-clubs', { now: NOW });
    assert.equal(out.due.length, 1);
    assert.equal(out.due[0].guid, GUID);
    assert.equal(out.due[0].defaultage, 7);
  });

  it('skips fresh GUID and empty queries seed', async () => {
    const host = 'club.example';
    const g2 = '22222222-2222-4222-8222-222222222222';
    const s3 = createMemoryS3([
      ['_root/', { Metadata: { defaultage: '7' } }],
      [`${host}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [
        `${host}/${GUID}/`,
        { Metadata: { annotated: '1', enabled: '1', lastsearch: '2026-10-24T12:00:00.000Z' } },
      ],
      [
        `${host}/${GUID}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'boots', intent: 'shop', maxResults: 10 }],
            exclude: [],
          }),
        },
      ],
      [`${host}/${g2}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [
        `${host}/${g2}/searches.json`,
        { Body: JSON.stringify({ queries: [], exclude: [] }) },
      ],
    ]);
    const out = await selectDueGuidSearches(s3, 'a-clubs', { now: NOW });
    assert.equal(out.due.length, 0);
    assert.ok(out.skipped >= 2);
  });

  it('club defaultage overrides root', async () => {
    const host = 'club.example';
    const s3 = createMemoryS3([
      ['_root/', { Metadata: { defaultage: '30' } }],
      [`${host}/`, { Metadata: { annotated: '1', enabled: '1', defaultage: '3' } }],
      [
        `${host}/${GUID}/`,
        {
          Metadata: {
            annotated: '1',
            enabled: '1',
            lastsearch: '2026-10-21T12:00:00.000Z',
          },
        },
      ],
      [
        `${host}/${GUID}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'hat', intent: 'shop', maxResults: 5 }],
            exclude: [],
          }),
        },
      ],
    ]);
    const out = await selectDueGuidSearches(s3, 'a-clubs', { now: NOW });
    assert.equal(out.due.length, 1);
    assert.equal(out.due[0].defaultage, 3);
  });
});

describe('FR #4916 runHourlySearches', () => {
  it('warns and skips when no credentials', async () => {
    const lines = [];
    const summary = await runHourlySearches({
      s3: createMemoryS3(),
      bucket: 'a-clubs',
      runSearch: async () => {
        throw new Error('should_not_run');
      },
      log: (l) => lines.push(l),
      hasCredentials: () => false,
    });
    assert.equal(summary.ran, 0);
    assert.deepEqual(summary.warnings, ['no_credentials']);
    assert.match(lines.join('\n'), /no_credentials/);
  });

  it('one failing GUID does not stop others', async () => {
    const host = 'club.example';
    const g2 = '22222222-2222-4222-8222-222222222222';
    const s3 = createMemoryS3([
      ['_root/', { Metadata: { defaultage: '7' } }],
      [`${host}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [`${host}/${GUID}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [`${host}/${g2}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [
        `${host}/${GUID}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'a', intent: 'shop', maxResults: 5 }],
            exclude: [],
          }),
        },
      ],
      [
        `${host}/${g2}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'b', intent: 'shop', maxResults: 5 }],
            exclude: [],
          }),
        },
      ],
    ]);
    const lines = [];
    const summary = await runHourlySearches({
      s3,
      bucket: 'a-clubs',
      now: NOW,
      hasCredentials: () => true,
      log: (l) => lines.push(l),
      runSearch: async (job) => {
        if (job.guid === GUID) throw new Error('boom');
        return { searchid: 'srch_ok', providers_queued: 2 };
      },
    });
    assert.equal(summary.ran, 1);
    assert.equal(summary.failed, 1);
    assert.match(lines.join('\n'), /fail host=/);
    assert.match(lines.join('\n'), /searchid=srch_ok/);
  });

  it('runs injectable runner for selected dues', async () => {
    const host = 'club.example';
    const s3 = createMemoryS3([
      ['_root/', { Metadata: { defaultage: '7' } }],
      [`${host}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [`${host}/${GUID}/`, { Metadata: { annotated: '1', enabled: '1' } }],
      [
        `${host}/${GUID}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'boots', intent: 'shop', maxResults: 10 }],
            exclude: [],
          }),
        },
      ],
    ]);
    const ran = [];
    const lines = [];
    const summary = await runHourlySearches({
      s3,
      bucket: 'a-clubs',
      now: NOW,
      hasCredentials: () => true,
      log: (l) => lines.push(l),
      runSearch: async (job) => {
        ran.push(job);
        if (job.guid === GUID) return { searchid: 'srch_x', providers_queued: ['ebay'] };
        throw new Error('unexpected');
      },
    });
    assert.equal(summary.ran, 1);
    assert.equal(summary.failed, 0);
    assert.equal(ran.length, 1);
    assert.match(lines.join('\n'), /searchid=srch_x/);
  });
});

describe('FR #4916 createPostSearchRunner', () => {
  it('posts queries from searches.json via injectable postJson', async () => {
    const host = 'club.example';
    const s3 = createMemoryS3([
      [
        `${host}/${GUID}/searches.json`,
        {
          Body: JSON.stringify({
            queries: [{ q: 'boots', intent: 'shop', maxResults: 10 }],
            exclude: ['x'],
            market: 'GB',
            currency: 'GBP',
          }),
        },
      ],
    ]);
    const posts = [];
    const runner = createPostSearchRunner({
      s3,
      bucket: 'a-clubs',
      apiUrl: 'https://api.example',
      postJson: async (url, body) => {
        posts.push({ url, body });
        return { searchid: 'srch_p', queued: ['ebay', 'sql'] };
      },
    });
    const out = await runner({ hostkey: host, guid: GUID });
    assert.equal(out.searchid, 'srch_p');
    assert.equal(out.providers_queued, 2);
    assert.equal(posts[0].url, 'https://api.example/search');
    assert.equal(posts[0].body.guid, GUID);
    assert.equal(posts[0].body.market, 'GB');
  });
});

describe('FR #4916 /search refresh (agentSearch)', () => {
  it('second POST gets a new searchid and fans out again', async () => {
    const host = 'club.example';
    const s3 = createMemoryS3([
      [`${host}/`, { Metadata: { userid: 'u1', annotated: '1' } }],
      [`${host}/${GUID}/`, { Metadata: { annotated: '1' } }],
    ]);
    const sent = [];
    let n = 0;
    const opts = {
      event: {
        headers: { 'x-agent-api-key': FAKE_KEY },
        body: {
          hostkey: host,
          guid: GUID,
          queries: [{ q: 'boots', intent: 'shop', maxResults: 10 }],
          exclude: [],
        },
      },
      env: {
        A_SEARCH_AGENT_API_KEY: FAKE_KEY,
        SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
      },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      sendMessage: async (p) => sent.push(p),
      newSearchId: () => {
        n += 1;
        return `srch_${n}`;
      },
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [{ id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' }],
      }),
    };
    const first = await handleAgentSearch(opts);
    const second = await handleAgentSearch(opts);
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, false);
    assert.notEqual(first.searchid, second.searchid);
    assert.ok(sent.length >= 2);
  });
});

describe('FR #4916 SEA / register / docs pins', () => {
  it('build script and docs name a-searches', () => {
    const build = read('scripts/build-a-search-sea.js');
    assert.match(build, /a-searches/);
    assert.match(build, /searches-entry\.js/);
    const docs = read('docs/a-annotator-a-sqlsearch.md');
    assert.match(docs, /a-searches/);
    assert.match(docs, /defaultage/);
    assert.match(docs, /A_SEARCHES_LOOP_MS/);
    const reg = read('walrus/install/Register-ASearchWalrusServices.ps1');
    assert.match(reg, /a-searches/);
    assert.match(reg, /A_SEARCHES_LOOP_MS/);
    const fan = read('docs/search-fanout.md');
    assert.match(fan, /FR #4916/);
    assert.doesNotMatch(fan, /idempotent: true/);
  });

  it('--version exits 0', () => {
    const r = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/sea/searches-entry.js'), '--version'],
      { encoding: 'utf8', cwd: ROOT },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /a-searches 0\.1\.0/);
  });
});

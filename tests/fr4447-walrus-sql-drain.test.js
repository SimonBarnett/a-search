'use strict';

/**
 * FR #4447: runnable walrus SQL drain + providers/local/sql worker.
 * Stubbed SQS/SQL/S3 → schema-valid a-clubs IN/{searchid}-sql.json;
 * localWorkerPath('sql') must resolve.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { localWorkerPath, runDrainJob } = require('../walrus/src/runJob');
const { createDrainRunner } = require('../walrus/src/drainRunner');
const { aClubsInAbsPath } = require('../walrus/src/aClubsInPath');
const {
  validateInResult,
  inResultKey,
} = require('../shared/search/inResultSchema');
const {
  SELECT_SQL,
  searchTextFromMsg,
} = require('../providers/local/sql/src/queryParts');

const ROOT = path.join(__dirname, '..');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a-clubs-4447-'));
}

function createFakeQueue() {
  /** @type {Array<object>} */
  const pending = [];
  /** @type {Array<object>} */
  const deleted = [];
  /** @type {Array<object>} */
  const visibility = [];
  let seq = 0;

  return {
    send(body) {
      const msg = {
        MessageId: `m-${++seq}`,
        ReceiptHandle: `rh-${seq}`,
        Body: typeof body === 'string' ? body : JSON.stringify(body),
      };
      pending.push(msg);
      return msg;
    },
    async receive() {
      if (pending.length === 0) return [];
      return [pending.shift()];
    },
    async deleteMessage(rh) {
      deleted.push(rh);
    },
    async changeVisibility(rh, t) {
      visibility.push({ rh, t });
    },
    deleted: () => deleted.slice(),
    visibility: () => visibility.slice(),
  };
}

describe('FR #4447 sql worker path', () => {
  it('localWorkerPath(sql) resolves to providers/local/sql/src/worker.js', () => {
    const p = localWorkerPath('sql', ROOT);
    assert.equal(
      path.normalize(p),
      path.normalize(path.join(ROOT, 'providers', 'local', 'sql', 'src', 'worker.js')),
    );
    assert.equal(fs.existsSync(p), true, `missing sql worker at ${p}`);
    const worker = require(p);
    assert.equal(typeof worker.run, 'function');
  });

  it('sql queryParts is SELECT-only (no writes to madeiradb / Parts)', () => {
    assert.match(SELECT_SQL, /^\s*SELECT\b/i);
    assert.doesNotMatch(SELECT_SQL, /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER)\b/i);
    assert.match(SELECT_SQL, /FROM\s+dbo\.Parts/i);
  });

  it('searchTextFromMsg reads agent queries {q} + exclude (not string-only)', () => {
    assert.equal(
      searchTextFromMsg({
        queries: [{ q: 'model aircraft' }, 'servo'],
        exclude: [{ match: 'title:calendar' }],
      }),
      'model aircraft servo -calendar',
    );
    assert.equal(searchTextFromMsg({ q: 'legacy' }), 'legacy');
    assert.equal(searchTextFromMsg({ queries: [] }), '');
  });
});

describe('FR #4447 walrus drain writes schema-valid IN/{searchid}-sql.json', () => {
  it('processOnce deletes after stubbed sql job writes valid IN file', async () => {
    const root = tmpRoot();
    const queue = createFakeQueue();
    const searchid = 'srch_1bd6fe0e6722cfbd04dd';
    const host = 'www.mymodelflyingclub.co.uk';
    const guid = 'de986521-72d8-4d55-8da3-12ca524d8d74';
    /** @type {string[]} */
    const lastmodKeys = [];

    queue.send({
      source: 'sql',
      searchid,
      searchId: searchid,
      userId: 'U-mmfc',
      host,
      hostkey: host,
      guid,
      widgetGuid: guid,
      env: 'live',
      queries: ['servo'],
      q: 'servo',
    });

    const runner = createDrainRunner({
      queue,
      runJob: async (msg, deps) =>
        runDrainJob(msg, {
          ...deps,
          aClubsRoot: root,
          repoRoot: ROOT,
          envVars: {
            MSSQL_DATABASE: 'a_search',
            A_SEARCH_ENV: 'live',
            A_CLUBS_ROOT: root,
            S3_RESULTS_BUCKET: 'a-clubs',
          },
          queryParts: async () => [
            {
              Source: 'awin',
              FeedKey: 'fk1',
              MerchantProductId: 'mp-1',
              Env: 'live',
              Title: 'Servo arm',
              Description: 'test part',
              Url: 'https://example.test/p/1',
              ImageUrl: 'https://example.test/i/1.jpg',
              Price: 9.99,
              Currency: 'GBP',
              Stock: '1',
            },
          ],
          touchLastmod: async (opts) => {
            lastmodKeys.push(String(opts && opts.Key));
            return { Key: opts.Key, lastmod: '2026-10-19T00:00:00.000Z' };
          },
        }),
    });

    const once = await runner.processOnce();
    assert.equal(once.ok, true, JSON.stringify(once));
    assert.deepEqual(queue.deleted(), ['rh-1']);
    assert.deepEqual(queue.visibility(), []);

    const expectedKey = inResultKey({
      hostkey: host,
      guid,
      searchid,
      source: 'sql',
    });
    assert.equal(
      expectedKey,
      `${host}/${guid}/IN/${searchid}-sql.json`,
    );

    const abs = aClubsInAbsPath({
      root,
      host,
      guid,
      searchId: `${searchid}-sql`,
    });
    assert.equal(fs.existsSync(abs), true, `missing IN file ${abs}`);
    const body = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const validated = validateInResult(body);
    assert.equal(validated.ok, true, JSON.stringify(validated));
    assert.equal(validated.value.source, 'sql');
    assert.equal(validated.value.searchid, searchid);
    assert.equal(validated.value.hostkey, host);
    assert.equal(validated.value.guid, guid);
    assert.ok(Array.isArray(validated.value.products));
    assert.ok(validated.value.products.length >= 1);
    assert.ok(
      lastmodKeys.some((k) => k === `${host}/${guid}/` || k.startsWith(`${host}/${guid}`)),
      `guid lastmod not touched: ${JSON.stringify(lastmodKeys)}`,
    );
    assert.ok(
      lastmodKeys.some((k) => k === `${host}/` || k === `${host}`),
      `host lastmod not touched: ${JSON.stringify(lastmodKeys)}`,
    );
  });

  it('does not delete when sql worker fails', async () => {
    const queue = createFakeQueue();
    queue.send({
      source: 'sql',
      searchId: 'srch_fail',
      host: 'h.example',
      widgetGuid: 'g1',
      env: 'live',
    });
    const runner = createDrainRunner({
      queue,
      runJob: async () => {
        throw new Error('sql_boom');
      },
    });
    const once = await runner.processOnce();
    assert.equal(once.ok, false);
    assert.deepEqual(queue.deleted(), []);
    assert.deepEqual(queue.visibility(), [{ rh: 'rh-1', t: 0 }]);
  });
});

describe('FR #4447 walrus drain entry + service registration', () => {
  it('walrus package start entry exists and main loops via createDrainRunner', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'walrus', 'package.json'), 'utf8'),
    );
    assert.equal(pkg.scripts.start, 'node src/index.js');
    const src = fs.readFileSync(path.join(ROOT, 'walrus', 'src', 'index.js'), 'utf8');
    assert.match(src, /createDrainRunner/);
    assert.match(src, /createSqsPoll|SQSClient/);
    assert.match(src, /processOnce|runLoop|while\s*\(/);
    assert.doesNotMatch(
      src,
      /Inject AWS SQS client in production host start script/,
    );
  });

  it('Register-WalrusSqlDrainService.ps1 is nssm-based with DryRun', () => {
    const ps1Path = path.join(
      ROOT,
      'walrus',
      'install',
      'Register-WalrusSqlDrainService.ps1',
    );
    assert.equal(fs.existsSync(ps1Path), true, `missing ${ps1Path}`);
    const ps1 = fs.readFileSync(ps1Path, 'utf8');
    assert.match(ps1, /nssm/i);
    assert.match(ps1, /DryRun|WhatIf/);
    assert.match(ps1, /a-search-walrus-sql-drain|walrus-sql-drain/i);
    assert.match(ps1, /walrus\\src\\index\.js|walrus\/src\/index\.js/);
    assert.match(ps1, /SqsDbBackedUrl|SQS_DB_BACKED_URL/);
    assert.match(ps1, /MssqlServer|MSSQL_SERVER/);
    assert.doesNotMatch(ps1, /sc\.exe create/);
  });
});

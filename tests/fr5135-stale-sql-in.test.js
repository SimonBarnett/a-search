'use strict';

/**
 * FR #5135: 0-product SQL search must not leave an older IN/sql.json in place.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runDrainJob } = require('../walrus/src/runJob');
const { sqlInResultKey } = require('../providers/local/sql/src/worker');
const { promoteInToLive } = require('../shared/widgets/promoteInToLive');
const { writeLiveProviderInResult } = require('../shared/search/writeLiveProviderInResult');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const ROOT = path.join(__dirname, '..');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a-clubs-5135-'));
}

describe('FR #5135 stale IN/sql.json', () => {
  it('search A products then search B 0 products deletes IN/sql.json and writes DONE B', async () => {
    const root = tmpRoot();
    const searchA = 'srch_5135_gloves';
    const searchB = 'srch_5135_empty';
    await runDrainJob(
      {
        source: 'sql',
        searchid: searchA,
        host: HOST,
        hostkey: HOST,
        guid: GUID,
        widgetGuid: GUID,
        env: 'live',
      },
      {
        aClubsRoot: root,
        repoRoot: ROOT,
        envVars: {
          MSSQL_DATABASE: 'a_search',
          A_SEARCH_ENV: 'live',
          A_CLUBS_ROOT: root,
        },
        loadWorker: () => ({
          run: async (_msg, deps) => {
            const Key = sqlInResultKey({ hostkey: HOST, guid: GUID });
            const body = {
              searchid: searchA,
              source: 'sql',
              hostkey: HOST,
              guid: GUID,
              products: [{ title: 'gloves', url: 'https://example.test/g' }],
            };
            await deps.putObject({
              Key,
              Body: `${JSON.stringify(body)}\n`,
            });
            return { ok: true, products: body.products, key: Key };
          },
        }),
        touchLastmod: async () => {},
      },
    );
    const sqlAbs = path.join(root, HOST, GUID, 'IN', 'sql.json');
    assert.equal(fs.existsSync(sqlAbs), true);
    assert.match(fs.readFileSync(sqlAbs, 'utf8'), /srch_5135_gloves/);

    await runDrainJob(
      {
        source: 'sql',
        searchid: searchB,
        host: HOST,
        hostkey: HOST,
        guid: GUID,
        widgetGuid: GUID,
        env: 'live',
      },
      {
        aClubsRoot: root,
        repoRoot: ROOT,
        envVars: {
          MSSQL_DATABASE: 'a_search',
          A_SEARCH_ENV: 'live',
          A_CLUBS_ROOT: root,
        },
        loadWorker: () => ({
          run: async () => ({ ok: true, products: [], key: null }),
        }),
        touchLastmod: async () => {},
      },
    );
    assert.equal(fs.existsSync(sqlAbs), false);
    const doneB = path.join(root, HOST, GUID, 'DONE', `${searchB}-sql.json`);
    assert.equal(fs.existsSync(doneB), true);
    const done = JSON.parse(fs.readFileSync(doneB, 'utf8'));
    assert.equal(done.status, 'serviced');
    assert.equal(Number(done.products), 0);
  });

  it('ebay 0 products does not delete IN/sql.json', async () => {
    const root = tmpRoot();
    const sqlAbs = path.join(root, HOST, GUID, 'IN', 'sql.json');
    fs.mkdirSync(path.dirname(sqlAbs), { recursive: true });
    fs.writeFileSync(
      sqlAbs,
      `${JSON.stringify({
        searchid: 'srch_keep',
        source: 'sql',
        hostkey: HOST,
        guid: GUID,
        products: [{ title: 'keep' }],
      })}\n`,
      'utf8',
    );
    await runDrainJob(
      {
        source: 'ebay',
        searchid: 'srch_ebay0',
        host: HOST,
        hostkey: HOST,
        guid: GUID,
        widgetGuid: GUID,
        env: 'live',
      },
      {
        aClubsRoot: root,
        repoRoot: ROOT,
        envVars: {
          MSSQL_DATABASE: 'a_search',
          A_SEARCH_ENV: 'live',
          A_CLUBS_ROOT: root,
        },
        loadWorker: () => ({
          run: async () => ({ ok: true, products: [], key: null }),
        }),
        touchLastmod: async () => {},
      },
    );
    assert.equal(fs.existsSync(sqlAbs), true);
  });

  it('promoteInToLive skips IN/sql.json whose searchid is not the current fanout', async () => {
    const store = new Map();
    const put = async ({ Key, Body }) => {
      store.set(
        Key,
        Buffer.isBuffer(Body) ? Body : Buffer.from(String(Body || ''), 'utf8'),
      );
      return {};
    };
    const get = async ({ Key }) => {
      const Body = store.get(Key);
      if (!Body) {
        const err = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Body };
    };
    await put({
      Key: `${HOST}/`,
      Body: Buffer.alloc(0),
    });
    await put({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
    });
    await put({
      Key: `${HOST}/${GUID}/live.json`,
      Body: '[]\n',
    });
    await put({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid: 'srch_now', queued: ['sql'] }),
    });
    await put({
      Key: `${HOST}/${GUID}/IN/sql.json`,
      Body: JSON.stringify({
        searchid: 'srch_old',
        source: 'sql',
        products: [{ id: 'stale-gloves', title: 'gloves' }],
      }),
    });
    await put({
      Key: `${HOST}/${GUID}/IN/srch_now-ebay.json`,
      Body: JSON.stringify({
        searchid: 'srch_now',
        source: 'ebay',
        products: [{ id: 'ebay-1', title: 'ok' }],
      }),
    });
    const out = await promoteInToLive({
      host: HOST,
      guid: GUID,
      getObject: get,
      putObject: put,
      listObjectsV2: async () => ({
        Contents: [
          { Key: `${HOST}/${GUID}/IN/sql.json` },
          { Key: `${HOST}/${GUID}/IN/srch_now-ebay.json` },
        ],
      }),
      headObject: async ({ Key }) => ({
        Metadata: Key.endsWith('/') ? { enabled: '0' } : {},
      }),
      copyObject: async () => ({}),
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
    });
    const dumped = JSON.stringify(out.live);
    assert.equal(dumped.includes('gloves'), false);
    assert.equal(dumped.includes('stale-gloves'), false);
    assert.ok(dumped.includes('ebay-1'));
  });

  it('writeLiveProviderInResult sql 0 products deletes IN/sql.json', async () => {
    const deleted = [];
    const out = await writeLiveProviderInResult({
      msg: {
        searchid: 'srch_live0',
        hostkey: HOST,
        guid: GUID,
        env: 'live',
      },
      source: 'sql',
      products: [],
      envVars: { A_CLUBS_BUCKET: 'a-clubs' },
      putObject: async () => ({}),
      deleteObject: async (input) => {
        deleted.push(input.Key);
      },
    });
    assert.equal(out.key, null);
    assert.ok(deleted.some((k) => String(k).endsWith('/IN/sql.json')));
  });
});

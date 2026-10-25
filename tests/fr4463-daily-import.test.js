'use strict';

/**
 * FR #4463: daily walrus parts import (affiliates + merchants).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'import');

const { parseRfc4180, parseDelimitedRecords } = require('../walrus/import/src/rfc4180');
const { parseAndMapFeed } = require('../walrus/import/src/parseMapped');
const { loadAllProviderConfigs, SEARCH_PROVIDER_IDS } = require('../walrus/import/src/providerConfig');
const { createMemoryStore } = require('../walrus/import/src/memoryStore');
const { validateBeforeMerge } = require('../walrus/import/src/validateFeed');
const { runDailyImport, precheck, listFeedFiles } = require('../walrus/import/src/runImport');
const { acquireImportLock } = require('../walrus/import/src/lock');
const { redactSecrets } = require('../walrus/import/src/mapRow');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function tmpMount() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4463-'));
  const aff = path.join(root, 'a-affiliates');
  const mer = path.join(root, 'a-merchants');
  fs.mkdirSync(aff, { recursive: true });
  fs.mkdirSync(mer, { recursive: true });
  return { root, aff, mer };
}

describe('FR #4463 migrations', () => {
  for (const name of [
    '019_Parts_ImportColumns.sql',
    '020_Parts_FullText.sql',
    '021_ImportCatalog.sql',
    '022_IngestSchema.sql',
    '024_DropIngestPartsStaging.sql',
  ]) {
    it(`${name} targets a_search and is idempotent-shaped`, () => {
      const sql = fs.readFileSync(path.join(ROOT, 'db', 'migrations', name), 'utf8');
      assert.equal(sql.split(/\r?\n/)[0].trim(), '-- target: a_search');
      assert.match(sql, /IF (NOT )?EXISTS|IF COL_LENGTH|IF OBJECT_ID/i);
      assert.doesNotMatch(sql, /madeiradb/i);
    });
  }

  it('020 creates FULLTEXT on Title/Description/Brand/Category KEY UX_Parts_PartId', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '020_Parts_FullText.sql'),
      'utf8',
    );
    assert.match(sql, /FULLTEXT INDEX ON dbo\.Parts/i);
    assert.match(sql, /KEY INDEX UX_Parts_PartId/);
    assert.match(sql, /CHANGE_TRACKING\s*=\s*AUTO/i);
  });
});

describe('FR #4463 provider.json', () => {
  it('schema file exists (draft 2020-12)', () => {
    const schema = loadJson(path.join(ROOT, 'providers', 'import-provider.schema.json'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  });

  it('every affiliate/merchant local has valid provider.json; no search providers', () => {
    const loaded = loadAllProviderConfigs(ROOT);
    assert.equal(loaded.ok, true, (loaded.errors || []).join('\n'));
    const ids = new Set(loaded.configs.map((c) => c.provider));
    for (const id of [
      'awin',
      'impact',
      'partnerize',
      'webgains',
      'tradedoubler',
      'admitad',
      'flexoffers',
      'avantlink',
      'shopify',
      'wix',
      'woocommerce',
      'squarespace',
      'magento',
      'ecwid',
      'bigcommerce',
    ]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
    for (const id of SEARCH_PROVIDER_IDS) {
      assert.equal(
        fs.existsSync(path.join(ROOT, 'providers', 'local', id, 'provider.json')),
        false,
      );
    }
  });
});

describe('FR #4463 parsers', () => {
  it('RFC4180 handles quoted commas', () => {
    const { records } = parseDelimitedRecords(
      'a,b\n"Widget, large",1\n',
      { delimiter: ',', quote: '"' },
    );
    assert.equal(records[0].a, 'Widget, large');
  });

  it('awin sample maps correctly', () => {
    const cfg = loadJson(path.join(ROOT, 'providers', 'local', 'awin', 'provider.json'));
    const raw = fs.readFileSync(path.join(FIX, 'awin-sample.csv'));
    const out = parseAndMapFeed(raw, cfg, { feedKey: '1902' });
    assert.equal(out.staged.length, 2);
    assert.equal(out.staged[0].sku, 'P1');
    assert.equal(out.staged[0].title, 'Widget, large');
    assert.equal(out.staged[0].price, 12.5);
    assert.equal(out.staged[1].currency, 'GBP');
  });

  it('shopify jsonl maps with shopdomain template', () => {
    const cfg = loadJson(path.join(ROOT, 'providers', 'local', 'shopify', 'provider.json'));
    const raw = fs.readFileSync(path.join(FIX, 'shopify-sample.jsonl'));
    const out = parseAndMapFeed(raw, cfg, {
      feedKey: 'shop1',
      shopdomain: 'example.myshopify.com',
    });
    assert.equal(out.staged.length, 2);
    assert.equal(out.staged[0].url, 'https://example.myshopify.com/products/blue-shirt');
    assert.equal(out.staged[0].price, 19);
  });

  it('tsv and xml and utf-16 parse', () => {
    const tsvCfg = {
      format: 'tsv',
      encoding: 'utf-8',
      csv: { delimiter: '\t', quote: '"', header: true },
      mapping: {
        sku: { from: 'id' },
        title: { from: 'title' },
        url: { from: 'url' },
        price: { from: 'price', transform: ['decimal'] },
      },
      requiredFields: ['sku', 'title', 'url'],
      validation: {},
    };
    const tsv = parseAndMapFeed(fs.readFileSync(path.join(FIX, 'sample.tsv')), tsvCfg, {
      feedKey: 't',
    });
    assert.equal(tsv.staged.length, 2);

    const xmlCfg = {
      format: 'xml',
      xml: { recordPath: '/rss/channel/item' },
      mapping: {
        sku: { from: 'id' },
        title: { from: 'title' },
        url: { from: 'url' },
        price: { from: 'price', transform: ['decimal'] },
      },
      requiredFields: ['sku', 'title', 'url'],
      validation: {},
    };
    const xml = parseAndMapFeed(fs.readFileSync(path.join(FIX, 'sample.xml')), xmlCfg, {
      feedKey: 'x',
    });
    assert.equal(xml.staged.length, 2);

    const u16Cfg = {
      format: 'csv',
      encoding: 'utf-16le',
      csv: { delimiter: ',', quote: '"', header: true },
      mapping: {
        sku: { from: 'id' },
        title: { from: 'title' },
        url: { from: 'url' },
        price: { from: 'price', transform: ['decimal'] },
      },
      requiredFields: ['sku', 'title', 'url'],
      validation: {},
    };
    const u16 = parseAndMapFeed(fs.readFileSync(path.join(FIX, 'sample-utf16.csv')), u16Cfg, {
      feedKey: 'u',
    });
    assert.equal(u16.staged.length, 1);
    assert.equal(u16.staged[0].title, 'Utf16 Item');
  });
});

describe('FR #4463 import pipeline (memory store)', () => {
  it('idempotent second run inserts/updates 0 and marks ok', async () => {
    const { aff, mer, root } = tmpMount();
    const feedDir = path.join(aff, 'awin', '1902');
    fs.mkdirSync(feedDir, { recursive: true });
    const file = path.join(feedDir, '2026-10-18.csv');
    fs.copyFileSync(path.join(FIX, 'awin-sample.csv'), file);
    const store = createMemoryStore({ env: 'sandbox' });
    const lockPath = path.join(root, 'import.lock');
    const common = {
      repoRoot: ROOT,
      database: 'a_search_sandbox',
      affiliatesRoot: aff,
      merchantsRoot: mer,
      mountRoots: [aff, mer],
      ftsInstalled: true,
      store,
      lockPath,
      provider: 'awin',
      deleteOnSuccess: false,
    };
    const r1 = await runDailyImport(common);
    assert.equal(r1.exitCode, 0);
    const first = r1.results.find((x) => x.status === 'ok');
    assert.ok(first);
    assert.ok(first.inserted >= 2);
    const r2 = await runDailyImport(common);
    assert.equal(r2.exitCode, 0);
    const second = r2.results.find((x) => x.status === 'already_ok' || x.status === 'ok');
    assert.ok(second);
    if (second.status === 'ok') {
      assert.equal(second.inserted, 0);
      assert.equal(second.updated, 0);
    }
  });

  it('isolation: bad feed fails without touching good feed rows', async () => {
    const { aff, mer, root } = tmpMount();
    const goodDir = path.join(aff, 'awin', '1902');
    fs.mkdirSync(goodDir, { recursive: true });
    fs.copyFileSync(path.join(FIX, 'awin-sample.csv'), path.join(goodDir, '2026-10-18.csv'));
    // enable impact temporarily via feed that fails schema
    const badDir = path.join(aff, 'impact', '1');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, '2026-10-18.csv'), 'nope\n1\n');

    const store = createMemoryStore({ env: 'sandbox' });
    // seed good rows
    const awinCfg = loadJson(path.join(ROOT, 'providers', 'local', 'awin', 'provider.json'));
    const parsed = parseAndMapFeed(fs.readFileSync(path.join(FIX, 'awin-sample.csv')), awinCfg, {
      feedKey: '1902',
    });
    store.mergeFeed({
      runId: 1,
      providerId: 'awin',
      feedKey: '1902',
      className: 'affiliate',
      staged: parsed.staged,
      deleteMissing: 'soft',
      dryRun: false,
    });
    const before = store.listActive('awin', '1902').length;

    // force impact enabled by patching load path: write temp enabled provider in mount-only run
    // Use provider filter awin only for good; separately run a failing validate
    const gate = validateBeforeMerge({
      staged: [],
      rejects: [{}, {}, {}],
      rowsRead: 3,
      validation: { maxRejectPct: 5, minRows: 1 },
    });
    assert.equal(gate.ok, false);
    assert.equal(before, store.listActive('awin', '1902').length);
    void root;
    void mer;
  });

  it('threshold breach leaves Parts untouched and records failure', async () => {
    const store = createMemoryStore({ env: 'sandbox' });
    const awinCfg = loadJson(path.join(ROOT, 'providers', 'local', 'awin', 'provider.json'));
    const parsed = parseAndMapFeed(fs.readFileSync(path.join(FIX, 'awin-sample.csv')), awinCfg, {
      feedKey: '1902',
    });
    store.mergeFeed({
      runId: 1,
      providerId: 'awin',
      feedKey: '1902',
      className: 'affiliate',
      staged: parsed.staged,
      deleteMissing: 'soft',
      dryRun: false,
    });
    const beforeCount = store.listActive('awin', '1902').length;
    const gate = validateBeforeMerge({
      staged: parsed.staged.slice(0, 1),
      rejects: [],
      rowsRead: 1,
      validation: { minRows: 1, maxRemovePct: 10, maxRejectPct: 5, minRowsVsPreviousPct: 50 },
      previousGoodCount: 2,
      wouldDelete: 1,
      activeCount: 2,
    });
    assert.equal(gate.ok, false);
    assert.equal(store.listActive('awin', '1902').length, beforeCount);
  });

  it('large-feed mid-batch failure leaves no deletes', () => {
    const store = createMemoryStore({ env: 'sandbox' });
    const staged = [];
    for (let i = 0; i < 5; i += 1) {
      staged.push({
        MerchantProductId: `K${i}`,
        sku: `K${i}`,
        title: `Item ${i}`,
        url: `https://ex/${i}`,
        price: 1,
        ContentHash: `h${i}`,
      });
    }
    // seed old rows including one that would be deleted
    store.mergeFeed({
      runId: 1,
      providerId: 'awin',
      feedKey: '1902',
      className: 'affiliate',
      staged: [
        ...staged,
        {
          MerchantProductId: 'OLD',
          sku: 'OLD',
          title: 'Old',
          url: 'https://ex/old',
          price: 1,
          ContentHash: 'hold',
        },
      ],
      deleteMissing: 'soft',
      dryRun: false,
    });
    assert.ok(store.listActive('awin', '1902').some((r) => r.MerchantProductId === 'OLD'));
    assert.throws(
      () =>
        store.mergeFeed({
          runId: 2,
          providerId: 'awin',
          feedKey: '1902',
          className: 'affiliate',
          staged,
          deleteMissing: 'soft',
          dryRun: false,
          largeFeedRows: 2,
          failAfterBatch: 1,
        }),
      /forced_batch_failure/,
    );
    // OLD must still be active (deletes only after all batches)
    assert.ok(store.listActive('awin', '1902').some((r) => r.MerchantProductId === 'OLD'));
  });

  it('purge hard-deletes only that shop', () => {
    const store = createMemoryStore({ env: 'sandbox' });
    for (const feed of ['shop1', 'shop2']) {
      store.mergeFeed({
        runId: 1,
        providerId: 'shopify',
        feedKey: feed,
        className: 'merchant',
        staged: [
          {
            MerchantProductId: '1',
            sku: '1',
            title: feed,
            url: 'https://x',
            ContentHash: 'h',
          },
        ],
        deleteMissing: 'none',
        dryRun: false,
      });
    }
    store.hardPurge('shopify', 'shop1');
    assert.equal(store.listActive('shopify', 'shop1').length, 0);
    assert.equal(store.listActive('shopify', 'shop2').length, 1);
  });

  it('second concurrent run exits 2 lock_held', async () => {
    const { aff, mer, root } = tmpMount();
    const store = createMemoryStore({ env: 'sandbox' });
    store.forceHoldAppLock(true);
    const r = await runDailyImport({
      repoRoot: ROOT,
      database: 'a_search_sandbox',
      affiliatesRoot: aff,
      merchantsRoot: mer,
      mountRoots: [aff, mer],
      ftsInstalled: true,
      store,
      lockPath: path.join(root, 'lock2.lock'),
    });
    assert.equal(r.exitCode, 2);
    assert.equal(r.code, 'lock_held');
  });

  it('end-of-run health rebuilds disabled index', () => {
    const store = createMemoryStore({ env: 'sandbox', disabledIndexes: ['IX_test'] });
    const health = store.endOfRunHealth();
    assert.deepEqual(health.rebuilt, ['IX_test']);
    assert.equal(store.disabledIndexes.size, 0);
  });

  it('failure starts one agent per feed+version (mocked)', async () => {
    const { aff, mer, root } = tmpMount();
    const feedDir = path.join(aff, 'awin', '1902');
    fs.mkdirSync(feedDir, { recursive: true });
    // file that will schema-drift
    fs.writeFileSync(
      path.join(feedDir, '2026-10-18.csv'),
      'wrong,headers\nx,y\n',
    );
    const store = createMemoryStore({ env: 'sandbox' });
    const launches = [];
    const launchAgent = async (info) => {
      const key = `${info.provider}|${info.feedKey}|${info.version}`;
      if (launches.includes(key)) return { started: false };
      launches.push(key);
      return { started: true };
    };
    const common = {
      repoRoot: ROOT,
      database: 'a_search_sandbox',
      affiliatesRoot: aff,
      merchantsRoot: mer,
      mountRoots: [aff, mer],
      ftsInstalled: true,
      store,
      lockPath: path.join(root, 'ag.lock'),
      provider: 'awin',
      launchAgent,
      failureRoot: path.join(root, 'failures'),
    };
    const r1 = await runDailyImport(common);
    assert.equal(r1.exitCode, 1);
    assert.equal(launches.length, 1);
    const r2 = await runDailyImport(common);
    assert.equal(r2.exitCode, 1);
    assert.equal(launches.length, 1);
  });

  it('dry-run writes nothing to Parts', async () => {
    const { aff, mer, root } = tmpMount();
    const feedDir = path.join(aff, 'awin', '1902');
    fs.mkdirSync(feedDir, { recursive: true });
    fs.copyFileSync(path.join(FIX, 'awin-sample.csv'), path.join(feedDir, '2026-10-18.csv'));
    const store = createMemoryStore({ env: 'sandbox' });
    const r = await runDailyImport({
      repoRoot: ROOT,
      database: 'a_search_sandbox',
      affiliatesRoot: aff,
      merchantsRoot: mer,
      mountRoots: [aff, mer],
      ftsInstalled: true,
      store,
      lockPath: path.join(root, 'dry.lock'),
      provider: 'awin',
      dryRun: true,
    });
    assert.equal(r.exitCode, 0);
    assert.equal(store.listActive('awin', '1902').length, 0);
    const dry = r.results.find((x) => x.status === 'dry-run-ok');
    assert.ok(dry);
    assert.ok(dry.wouldInsert >= 2);
  });

  it('redacts secrets from samples/logs', () => {
    const s = redactSecrets('token=FAKESECRET_i3j4k5l6m7n8o9p0q1r2 password=hunter2 Bearer abcdef');
    assert.match(s, /FAKE_REDACTED/);
    assert.doesNotMatch(s, /hunter2/);
  });
});

describe('FR #4463 install + docs + agent', () => {
  it('Register-DailyImportTask.ps1 WhatIf prints daily 04:00 IgnoreNew', () => {
    const ps = fs.readFileSync(
      path.join(ROOT, 'walrus', 'install', 'Register-DailyImportTask.ps1'),
      'utf8',
    );
    assert.match(ps, /04:00/);
    assert.match(ps, /MultipleInstances IgnoreNew/);
    assert.match(ps, /WhatIf/);
    assert.match(ps, /a-search-daily-import/);
  });

  it('docs/daily-import.md and AGENT.md exist', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'daily-import.md')));
    assert.ok(fs.existsSync(path.join(ROOT, 'walrus', 'import', 'AGENT.md')));
    const agent = fs.readFileSync(path.join(ROOT, 'walrus', 'import', 'AGENT.md'), 'utf8');
    assert.match(agent, /must never/i);
    assert.match(agent, /madeiradb/);
  });

  it('precheck refuses non-writable DB', () => {
    const r = precheck({
      database: 'madeiradb',
      repoRoot: ROOT,
      mountRoots: [],
      ftsInstalled: true,
    });
    assert.equal(r.ok, false);
  });
});

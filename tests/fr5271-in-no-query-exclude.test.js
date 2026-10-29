'use strict';

/**
 * FR #5271: IN/ bodies keep searchid/source/hostkey/guid/products only.
 * No queries/exclude. Rank stays on part rows.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  buildInResult,
  validateInResult,
} = require('../shared/search/inResultSchema');
const { writeInResultToS3 } = require('../shared/search/writeInResultS3');
const { writeAClubsIn } = require('../walrus/src/writeAClubsIn');
const { writeResults } = require('../shared/writeResults');

const META = {
  searchid: 'srch_167cbaa068f186973ac0',
  source: 'ebay',
  hostkey: 'www.mymodelflyingclub.co.uk',
  guid: '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0',
};

function assertEnvelope(body) {
  assert.equal(body.searchid, META.searchid);
  assert.equal(body.source, META.source);
  assert.equal(body.hostkey, META.hostkey);
  assert.equal(body.guid, META.guid);
  assert.ok(Array.isArray(body.products));
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'queries'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'exclude'), false);
  for (const p of body.products) {
    assert.ok(Number.isFinite(Number(p.rank)));
  }
}

describe('FR #5271 IN envelope has no queries/exclude', () => {
  it('validateInResult / buildInResult drop queries and exclude', () => {
    const v = validateInResult({
      ...META,
      products: [{ id: '1', rank: 18 }],
      queries: [{ q: 'cub' }],
      exclude: ['socks'],
    });
    assert.equal(v.ok, true);
    assertEnvelope(v.value);
    const built = buildInResult({
      ...META,
      products: [{ id: '1', rank: 9 }],
      queries: ['leak'],
      exclude: ['leak'],
    });
    assertEnvelope(built);
  });

  it('writeInResultToS3 writes the envelope without query/exclude', async () => {
    let raw = '';
    await writeInResultToS3({
      ...META,
      products: [{ id: 'ebay-1', title: 'cub', rank: 200 }],
      queries: [{ q: 'VOLANTEXRC' }],
      exclude: ['calendar'],
      putObject: async ({ Body }) => {
        raw = Buffer.isBuffer(Body) ? Body.toString('utf8') : String(Body);
      },
    });
    assertEnvelope(JSON.parse(raw));
  });

  it('writeAClubsIn fallback uses searchid/hostkey/guid not searchId/userId', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5271-'));
    const out = writeAClubsIn({
      root,
      msg: {
        searchId: META.searchid,
        source: 'ebay',
        userId: 'U1',
        host: META.hostkey,
        guid: META.guid,
      },
      products: [{ id: 'p', rank: 3 }],
      body: {
        searchId: META.searchid,
        source: 'ebay',
        userId: 'U1',
        host: META.hostkey,
        guid: META.guid,
        products: [{ id: 'p', rank: 3 }],
        queries: [{ q: 'nope' }],
        exclude: ['x'],
      },
    });
    const body = JSON.parse(fs.readFileSync(out.abs, 'utf8'));
    assertEnvelope(body);
  });

  it('writeResults body uses searchid/hostkey/guid', async () => {
    let raw = '';
    await writeResults({
      env: 'live',
      source: META.source,
      userId: META.hostkey,
      catalogId: META.guid,
      searchId: META.searchid,
      products: [{ id: 'p1', rank: 1 }],
      envVars: { S3_RESULTS_BUCKET: 'test-bucket' },
      putObject: async (args) => {
        raw = String(args.Body);
      },
    });
    assertEnvelope(JSON.parse(raw));
  });

  it('docs pin FR #5271 no queries on IN', () => {
    const fanout = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(fanout, /5271|#5271/);
    assert.match(fanout, /do not store `queries`/);
  });
});

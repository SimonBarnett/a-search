'use strict';

/**
 * FR-094: admitad maintainer feed-parser hook stub (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  parseAdmitadFeedRows,
  admitadParseFeedRowsHook,
  assertAdmitadFeedCreds,
  AdmitadFeedCredsError,
  readDefaultFixtureCsv,
  DEFAULT_FIXTURE,
} = require('../providers/local/admitad/src/parseFeed');

const meta = {
  source: 'admitad',
  feedKey: 'camp-fixture-1',
  env: 'sandbox',
  contentHash: 'hash-fixture',
};

describe('FR-094 admitad feed-parser hook', () => {
  it('fixture CSV parses to Parts-shaped rows', () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.csv required');
    const csv = readDefaultFixtureCsv();
    const rows = parseAdmitadFeedRows(csv, meta);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Source, 'admitad');
    assert.equal(rows[0].FeedKey, 'camp-fixture-1');
    assert.equal(rows[0].Env, 'sandbox');
    assert.equal(rows[0].MerchantProductId, 'ad-100');
    assert.equal(rows[0].Title, 'Widget Alpha');
    assert.equal(rows[0].Price, 19.99);
    assert.equal(rows[0].Currency, 'GBP');
    assert.equal(rows[0].ContentHash, 'hash-fixture');
    assert.equal(rows[1].MerchantProductId, 'ad-200');
    assert.equal(rows[1].Price, 5.5);
  });

  it('skips rows missing id or title without throw', () => {
    const csv = [
      'merchant_product_id,title,price',
      'td-ok,Has Title,1.00',
      ',No Id,2.00',
      'td-bare,,3.00',
      '',
    ].join('\n');
    const rows = parseAdmitadFeedRows(csv, meta);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].MerchantProductId, 'td-ok');
  });

  it('JSON array path maps aliases', () => {
    const body = JSON.stringify([
      {
        product_id: 'j1',
        name: 'JSON Widget',
        link: 'https://example.invalid/j1',
        price: '9.00',
        currency: 'USD',
      },
    ]);
    const rows = parseAdmitadFeedRows(body, {
      ...meta,
      env: 'live',
      feedKey: 'json-feed',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Env, 'live');
    assert.equal(rows[0].MerchantProductId, 'j1');
    assert.equal(rows[0].Title, 'JSON Widget');
    assert.equal(rows[0].Url, 'https://example.invalid/j1');
    assert.equal(rows[0].Price, 9);
  });

  it('admitadParseFeedRowsHook rejects non-admitad source', () => {
    assert.throws(
      () =>
        admitadParseFeedRowsHook('[]', {
          source: 'awin',
          feedKey: 'x',
          env: 'sandbox',
        }),
      /wrong source/,
    );
  });

  it('assertAdmitadFeedCreds requires API key placeholder', () => {
    assert.throws(
      () => assertAdmitadFeedCreds({}),
      (err) =>
        err instanceof AdmitadFeedCredsError &&
        err.code === 'admitad_missing_feed_credentials',
    );
    const creds = assertAdmitadFeedCreds({
      ADMITAD_API_KEY: 'fixture-key',
      ADMITAD_FEED_URL: 'https://feeds.example.invalid/admitad.csv',
      ADMITAD_PUBLISHER_ID: 'pub-1',
    });
    assert.equal(creds.apiKey, 'fixture-key');
    assert.equal(creds.publisherId, 'pub-1');
    assert.match(String(creds.defaultFeedUrl), /admitad\.csv/);
  });

  it('registry keeps admitad enabled false both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const pz = registry.sources.find((s) => s.id === 'admitad');
    assert.ok(pz);
    assert.equal(pz.enabled.live, false);
    assert.equal(pz.enabled.sandbox, false);
  });

  it('skill documents feed-parser hook + env keys', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'admitad',
        '.grok',
        'skills',
        'a-search-admitad',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /ADMITAD_FEED_URL/);
    assert.match(skill, /ADMITAD_API_KEY/);
    assert.match(skill, /FR-094/);
    assert.ok(!skill.includes('\ufffd'));
  });
});

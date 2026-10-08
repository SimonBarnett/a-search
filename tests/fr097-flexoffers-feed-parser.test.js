'use strict';

/**
 * FR-097: flexoffers maintainer feed-parser hook stub (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  parseFlexoffersFeedRows,
  flexoffersParseFeedRowsHook,
  assertFlexoffersFeedCreds,
  FlexoffersFeedCredsError,
  readDefaultFixtureCsv,
  DEFAULT_FIXTURE,
} = require('../providers/local/flexoffers/src/parseFeed');

const meta = {
  source: 'flexoffers',
  feedKey: 'camp-fixture-1',
  env: 'sandbox',
  contentHash: 'hash-fixture',
};

describe('FR-097 flexoffers feed-parser hook', () => {
  it('fixture CSV parses to Parts-shaped rows', () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.csv required');
    const csv = readDefaultFixtureCsv();
    const rows = parseFlexoffersFeedRows(csv, meta);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Source, 'flexoffers');
    assert.equal(rows[0].FeedKey, 'camp-fixture-1');
    assert.equal(rows[0].Env, 'sandbox');
    assert.equal(rows[0].MerchantProductId, 'fo-100');
    assert.equal(rows[0].Title, 'Widget Alpha');
    assert.equal(rows[0].Price, 19.99);
    assert.equal(rows[0].Currency, 'GBP');
    assert.equal(rows[0].ContentHash, 'hash-fixture');
    assert.equal(rows[1].MerchantProductId, 'fo-200');
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
    const rows = parseFlexoffersFeedRows(csv, meta);
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
    const rows = parseFlexoffersFeedRows(body, {
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

  it('flexoffersParseFeedRowsHook rejects non-flexoffers source', () => {
    assert.throws(
      () =>
        flexoffersParseFeedRowsHook('[]', {
          source: 'awin',
          feedKey: 'x',
          env: 'sandbox',
        }),
      /wrong source/,
    );
  });

  it('assertFlexoffersFeedCreds requires API key placeholder', () => {
    assert.throws(
      () => assertFlexoffersFeedCreds({}),
      (err) =>
        err instanceof FlexoffersFeedCredsError &&
        err.code === 'flexoffers_missing_feed_credentials',
    );
    const creds = assertFlexoffersFeedCreds({
      FLEXOFFERS_API_KEY: 'fixture-key',
      FLEXOFFERS_FEED_URL: 'https://feeds.example.invalid/flexoffers.csv',
      FLEXOFFERS_PUBLISHER_ID: 'pub-1',
    });
    assert.equal(creds.apiKey, 'fixture-key');
    assert.equal(creds.publisherId, 'pub-1');
    assert.match(String(creds.defaultFeedUrl), /flexoffers\.csv/);
  });

  it('registry keeps flexoffers enabled false both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const pz = registry.sources.find((s) => s.id === 'flexoffers');
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
        'flexoffers',
        '.grok',
        'skills',
        'a-search-flexoffers',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /FLEXOFFERS_FEED_URL/);
    assert.match(skill, /FLEXOFFERS_API_KEY/);
    assert.match(skill, /FR-097/);
    assert.ok(!skill.includes('\ufffd'));
  });
});

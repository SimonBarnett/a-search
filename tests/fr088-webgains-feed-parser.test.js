'use strict';

/**
 * FR-088: webgains maintainer feed-parser hook stub (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  parseWebgainsFeedRows,
  webgainsParseFeedRowsHook,
  assertWebgainsFeedCreds,
  WebgainsFeedCredsError,
  readDefaultFixtureCsv,
  DEFAULT_FIXTURE,
} = require('../providers/local/webgains/src/parseFeed');

const meta = {
  source: 'webgains',
  feedKey: 'camp-fixture-1',
  env: 'sandbox',
  contentHash: 'hash-fixture',
};

describe('FR-088 webgains feed-parser hook', () => {
  it('fixture CSV parses to Parts-shaped rows', () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.csv required');
    const csv = readDefaultFixtureCsv();
    const rows = parseWebgainsFeedRows(csv, meta);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Source, 'webgains');
    assert.equal(rows[0].FeedKey, 'camp-fixture-1');
    assert.equal(rows[0].Env, 'sandbox');
    assert.equal(rows[0].MerchantProductId, 'wg-100');
    assert.equal(rows[0].Title, 'Widget Alpha');
    assert.equal(rows[0].Price, 19.99);
    assert.equal(rows[0].Currency, 'GBP');
    assert.equal(rows[0].ContentHash, 'hash-fixture');
    assert.equal(rows[1].MerchantProductId, 'wg-200');
    assert.equal(rows[1].Price, 5.5);
  });

  it('skips rows missing id or title without throw', () => {
    const csv = [
      'merchant_product_id,title,price',
      'wg-ok,Has Title,1.00',
      ',No Id,2.00',
      'wg-bare,,3.00',
      '',
    ].join('\n');
    const rows = parseWebgainsFeedRows(csv, meta);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].MerchantProductId, 'wg-ok');
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
    const rows = parseWebgainsFeedRows(body, {
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

  it('webgainsParseFeedRowsHook rejects non-webgains source', () => {
    assert.throws(
      () =>
        webgainsParseFeedRowsHook('[]', {
          source: 'awin',
          feedKey: 'x',
          env: 'sandbox',
        }),
      /wrong source/,
    );
  });

  it('assertWebgainsFeedCreds requires API key placeholder', () => {
    assert.throws(
      () => assertWebgainsFeedCreds({}),
      (err) =>
        err instanceof WebgainsFeedCredsError &&
        err.code === 'webgains_missing_feed_credentials',
    );
    const creds = assertWebgainsFeedCreds({
      WEBGAINS_API_KEY: 'fixture-key',
      WEBGAINS_FEED_URL: 'https://feeds.example.invalid/webgains.csv',
      WEBGAINS_PUBLISHER_ID: 'pub-1',
    });
    assert.equal(creds.apiKey, 'fixture-key');
    assert.equal(creds.publisherId, 'pub-1');
    assert.match(String(creds.defaultFeedUrl), /webgains\.csv/);
  });

  it('registry keeps webgains enabled false both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const pz = registry.sources.find((s) => s.id === 'webgains');
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
        'webgains',
        '.grok',
        'skills',
        'a-search-webgains',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /WEBGAINS_FEED_URL/);
    assert.match(skill, /WEBGAINS_API_KEY/);
    assert.match(skill, /FR-088/);
    assert.ok(!skill.includes('\ufffd'));
  });
});

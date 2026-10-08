'use strict';

/**
 * MRB #788 hostile pins for FR-091 tradedoubler feed-parser (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  parseTradedoublerFeedRows,
  tradedoublerParseFeedRowsHook,
  assertTradedoublerFeedCreds,
  readDefaultFixtureCsv,
} = require('../providers/local/tradedoubler/src/parseFeed');

describe('MRB-788 FR-091 hostile', () => {
  it('registry tradedoubler stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const wg = registry.sources.find((s) => s.id === 'tradedoubler');
    assert.ok(wg);
    assert.equal(wg.enabled.live, false);
    assert.equal(wg.enabled.sandbox, false);
    assert.equal(wg.kind, 'local');
  });

  it('hook matches maintainer deps.parseFeedRows(body, meta) shape', () => {
    const csv = readDefaultFixtureCsv();
    const rows = tradedoublerParseFeedRowsHook(csv, {
      source: 'tradedoubler',
      feedKey: 'mrb-hostile',
      env: 'live',
      contentHash: 'abc',
    });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.Source, 'tradedoubler');
      assert.equal(r.FeedKey, 'mrb-hostile');
      assert.equal(r.Env, 'live');
      assert.ok(r.MerchantProductId);
      assert.ok(r.Title);
    }
  });

  it('fixture and env.example have no secrets / use example.invalid', () => {
    const csv = readDefaultFixtureCsv();
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'tradedoubler', '.env.example'),
      'utf8',
    );
    assert.match(csv, /example\.invalid/);
    assert.match(envEx, /TRADEDOUBLER_FEED_URL=/);
    assert.match(envEx, /TRADEDOUBLER_API_KEY=/);
    assert.match(envEx, /TRADEDOUBLER_FEED_TOKEN=/);
    const keyLine = envEx.split(/\r?\n/).find((l) => l.startsWith('TRADEDOUBLER_API_KEY='));
    assert.equal(keyLine, 'TRADEDOUBLER_API_KEY=');
  });

  it('meta.env and meta.feedKey are required', () => {
    assert.throws(
      () => parseTradedoublerFeedRows('[]', { source: 'tradedoubler', env: 'sandbox' }),
      /feedKey/,
    );
    assert.throws(
      () =>
        parseTradedoublerFeedRows('[]', {
          source: 'tradedoubler',
          feedKey: 'x',
          env: 'prod',
        }),
      /live\|sandbox/,
    );
  });

  it('TRADEDOUBLER_FEED_TOKEN alias satisfies assertTradedoublerFeedCreds', () => {
    const c = assertTradedoublerFeedCreds({ TRADEDOUBLER_FEED_TOKEN: ' tok ' });
    assert.equal(c.apiKey, 'tok');
  });

  it('skill documents FR-091 parseFeed + stay-dark; keeps FR-089', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'tradedoubler',
        '.grok',
        'skills',
        'a-search-tradedoubler',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-091/);
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /FR-089/);
    assert.match(skill, /stay-dark|enabled\.live\s*=\s*false/i);
  });
});

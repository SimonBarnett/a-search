'use strict';

/**
 * MRB #755 hostile pins for FR-088 webgains feed-parser (stay-dark).
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
  readDefaultFixtureCsv,
} = require('../providers/local/webgains/src/parseFeed');

describe('MRB-755 FR-088 hostile', () => {
  it('registry webgains stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const wg = registry.sources.find((s) => s.id === 'webgains');
    assert.ok(wg);
    assert.equal(wg.enabled.live, false);
    assert.equal(wg.enabled.sandbox, false);
    assert.equal(wg.kind, 'local');
  });

  it('hook matches maintainer deps.parseFeedRows(body, meta) shape', () => {
    const csv = readDefaultFixtureCsv();
    const rows = webgainsParseFeedRowsHook(csv, {
      source: 'webgains',
      feedKey: 'mrb-hostile',
      env: 'live',
      contentHash: 'abc',
    });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.Source, 'webgains');
      assert.equal(r.FeedKey, 'mrb-hostile');
      assert.equal(r.Env, 'live');
      assert.ok(r.MerchantProductId);
      assert.ok(r.Title);
    }
  });

  it('fixture and env.example have no secrets / use example.invalid', () => {
    const csv = readDefaultFixtureCsv();
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'webgains', '.env.example'),
      'utf8',
    );
    assert.match(csv, /example\.invalid/);
    assert.match(envEx, /WEBGAINS_FEED_URL=/);
    assert.match(envEx, /WEBGAINS_API_KEY=/);
    assert.match(envEx, /WEBGAINS_API_TOKEN=/);
    const keyLine = envEx.split(/\r?\n/).find((l) => l.startsWith('WEBGAINS_API_KEY='));
    assert.equal(keyLine, 'WEBGAINS_API_KEY=');
  });

  it('meta.env and meta.feedKey are required', () => {
    assert.throws(
      () => parseWebgainsFeedRows('[]', { source: 'webgains', env: 'sandbox' }),
      /feedKey/,
    );
    assert.throws(
      () =>
        parseWebgainsFeedRows('[]', {
          source: 'webgains',
          feedKey: 'x',
          env: 'prod',
        }),
      /live\|sandbox/,
    );
  });

  it('WEBGAINS_FEED_TOKEN alias satisfies assertWebgainsFeedCreds', () => {
    const c = assertWebgainsFeedCreds({ WEBGAINS_FEED_TOKEN: ' tok ' });
    assert.equal(c.apiKey, 'tok');
  });

  it('skill documents FR-088 parseFeed + stay-dark; keeps FR-087', () => {
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
    assert.match(skill, /FR-088/);
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /FR-087/);
    assert.match(skill, /stay-dark|enabled\.live\s*=\s*false/i);
  });
});

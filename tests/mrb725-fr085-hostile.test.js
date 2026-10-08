'use strict';

/**
 * MRB #725 hostile pins for FR-085 partnerize feed-parser (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  parsePartnerizeFeedRows,
  partnerizeParseFeedRowsHook,
  assertPartnerizeFeedCreds,
  readDefaultFixtureCsv,
} = require('../providers/local/partnerize/src/parseFeed');

describe('MRB-725 FR-085 hostile', () => {
  it('registry partnerize stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const pz = registry.sources.find((s) => s.id === 'partnerize');
    assert.ok(pz);
    assert.equal(pz.enabled.live, false);
    assert.equal(pz.enabled.sandbox, false);
    assert.equal(pz.kind, 'local');
  });

  it('hook matches maintainer deps.parseFeedRows(body, meta) shape', () => {
    const csv = readDefaultFixtureCsv();
    const rows = partnerizeParseFeedRowsHook(csv, {
      source: 'partnerize',
      feedKey: 'mrb-hostile',
      env: 'live',
      contentHash: 'abc',
    });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.Source, 'partnerize');
      assert.equal(r.FeedKey, 'mrb-hostile');
      assert.equal(r.Env, 'live');
      assert.ok(r.MerchantProductId);
      assert.ok(r.Title);
    }
  });

  it('fixture and env.example have no secrets / use example.invalid', () => {
    const csv = readDefaultFixtureCsv();
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'partnerize', '.env.example'),
      'utf8',
    );
    assert.match(csv, /example\.invalid/);
    assert.match(envEx, /PARTNERIZE_FEED_URL=/);
    assert.match(envEx, /PARTNERIZE_API_KEY=/);
    const keyLine = envEx.split(/\r?\n/).find((l) => l.startsWith('PARTNERIZE_API_KEY='));
    assert.equal(keyLine, 'PARTNERIZE_API_KEY=');
  });

  it('meta.env and meta.feedKey are required', () => {
    assert.throws(
      () => parsePartnerizeFeedRows('[]', { source: 'partnerize', env: 'sandbox' }),
      /feedKey/,
    );
    assert.throws(
      () =>
        parsePartnerizeFeedRows('[]', {
          source: 'partnerize',
          feedKey: 'x',
          env: 'prod',
        }),
      /live\|sandbox/,
    );
  });

  it('PARTNERIZE_FEED_TOKEN alias satisfies assertPartnerizeFeedCreds', () => {
    const c = assertPartnerizeFeedCreds({ PARTNERIZE_FEED_TOKEN: ' tok ' });
    assert.equal(c.apiKey, 'tok');
  });

  it('skill documents FR-085 parseFeed + stay-dark', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'partnerize',
        '.grok',
        'skills',
        'a-search-partnerize',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-085/);
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /stay-dark|enabled\.live=false/i);
  });
});
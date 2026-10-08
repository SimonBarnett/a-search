'use strict';

/**
 * MRB #816 hostile pins for FR-097 flexoffers feed-parser (stay-dark).
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
  readDefaultFixtureCsv,
} = require('../providers/local/flexoffers/src/parseFeed');

describe('MRB-816 FR-097 hostile', () => {
  it('registry flexoffers stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const fo = registry.sources.find((s) => s.id === 'flexoffers');
    assert.ok(fo);
    assert.equal(fo.enabled.live, false);
    assert.equal(fo.enabled.sandbox, false);
    assert.equal(fo.kind, 'local');
  });

  it('hook matches maintainer deps.parseFeedRows(body, meta) shape', () => {
    const csv = readDefaultFixtureCsv();
    const rows = flexoffersParseFeedRowsHook(csv, {
      source: 'flexoffers',
      feedKey: 'mrb-hostile',
      env: 'live',
      contentHash: 'abc',
    });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.Source, 'flexoffers');
      assert.equal(r.FeedKey, 'mrb-hostile');
      assert.equal(r.Env, 'live');
      assert.ok(r.MerchantProductId);
      assert.ok(r.Title);
    }
  });

  it('fixture and env.example have no secrets / use example.invalid', () => {
    const csv = readDefaultFixtureCsv();
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'flexoffers', '.env.example'),
      'utf8',
    );
    assert.match(csv, /example\.invalid/);
    assert.match(envEx, /FLEXOFFERS_FEED_URL=/);
    assert.match(envEx, /FLEXOFFERS_API_KEY=/);
    assert.match(envEx, /FLEXOFFERS_FEED_TOKEN=/);
    const keyLine = envEx.split(/\r?\n/).find((l) => l.startsWith('FLEXOFFERS_API_KEY='));
    assert.equal(keyLine, 'FLEXOFFERS_API_KEY=');
  });

  it('meta.env and meta.feedKey are required', () => {
    assert.throws(
      () => parseFlexoffersFeedRows('[]', { source: 'flexoffers', env: 'sandbox' }),
      /feedKey/,
    );
    assert.throws(
      () =>
        parseFlexoffersFeedRows('[]', {
          source: 'flexoffers',
          feedKey: 'x',
          env: 'prod',
        }),
      /live\|sandbox/,
    );
  });

  it('FLEXOFFERS_FEED_TOKEN alias satisfies assertFlexoffersFeedCreds', () => {
    const c = assertFlexoffersFeedCreds({ FLEXOFFERS_FEED_TOKEN: ' tok ' });
    assert.equal(c.apiKey, 'tok');
  });

  it('skill documents FR-097 parseFeed + stay-dark; keeps FR-095/096', () => {
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
    assert.match(skill, /## Maintainer feed-parser \(FR-097\)/);
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /FR-095/);
    assert.match(skill, /FR-096/);
    assert.match(skill, /stay-dark|enabled\.live\s*=\s*false/i);
  });
});

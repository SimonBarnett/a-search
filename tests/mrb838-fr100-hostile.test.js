'use strict';

/**
 * MRB #838 hostile pins for FR-100 avantlink feed-parser (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  parseAvantlinkFeedRows,
  avantlinkParseFeedRowsHook,
  assertAvantlinkFeedCreds,
  readDefaultFixtureCsv,
} = require('../providers/local/avantlink/src/parseFeed');

describe('MRB-838 FR-100 hostile', () => {
  it('registry avantlink stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const al = registry.sources.find((s) => s.id === 'avantlink');
    assert.ok(al);
    assert.equal(al.enabled.live, false);
    assert.equal(al.enabled.sandbox, false);
    assert.equal(al.kind, 'local');
  });

  it('hook matches maintainer deps.parseFeedRows(body, meta) shape', () => {
    const csv = readDefaultFixtureCsv();
    const rows = avantlinkParseFeedRowsHook(csv, {
      source: 'avantlink',
      feedKey: 'mrb-hostile',
      env: 'live',
      contentHash: 'abc',
    });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.Source, 'avantlink');
      assert.equal(r.FeedKey, 'mrb-hostile');
      assert.equal(r.Env, 'live');
      assert.ok(r.MerchantProductId);
      assert.ok(r.Title);
    }
  });

  it('fixture and env.example have no secrets / use example.invalid', () => {
    const csv = readDefaultFixtureCsv();
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'avantlink', '.env.example'),
      'utf8',
    );
    assert.match(csv, /example\.invalid/);
    assert.match(envEx, /AVANTLINK_FEED_URL=/);
    assert.match(envEx, /AVANTLINK_API_KEY=/);
    assert.match(envEx, /AVANTLINK_FEED_TOKEN=/);
    const keyLine = envEx.split(/\r?\n/).find((l) => l.startsWith('AVANTLINK_API_KEY='));
    assert.equal(keyLine, 'AVANTLINK_API_KEY=');
  });

  it('meta.env and meta.feedKey are required', () => {
    assert.throws(
      () => parseAvantlinkFeedRows('[]', { source: 'avantlink', env: 'sandbox' }),
      /feedKey/,
    );
    assert.throws(
      () =>
        parseAvantlinkFeedRows('[]', {
          source: 'avantlink',
          feedKey: 'x',
          env: 'prod',
        }),
      /live\|sandbox/,
    );
  });

  it('AVANTLINK_FEED_TOKEN alias satisfies assertAvantlinkFeedCreds', () => {
    const c = assertAvantlinkFeedCreds({ AVANTLINK_FEED_TOKEN: ' tok ' });
    assert.equal(c.apiKey, 'tok');
  });

  it('skill documents FR-100 parseFeed + stay-dark; keeps FR-098/099', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'avantlink',
        '.grok',
        'skills',
        'a-search-avantlink',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Maintainer feed-parser \(FR-100\)/);
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /FR-098/);
    assert.match(skill, /FR-099/);
    assert.match(skill, /stay-dark|enabled\.live\s*=\s*false/i);
    assert.ok(!skill.includes('\ufffd'));
  });
});

'use strict';

/**
 * MRB #807 hostile pins for FR-094 admitad feed-parser (stay-dark).
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
  readDefaultFixtureCsv,
} = require('../providers/local/admitad/src/parseFeed');

describe('MRB-807 FR-094 hostile', () => {
  it('registry admitad stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ad = registry.sources.find((s) => s.id === 'admitad');
    assert.ok(ad);
    assert.equal(ad.enabled.live, false);
    assert.equal(ad.enabled.sandbox, false);
    assert.equal(ad.kind, 'local');
  });

  it('hook matches maintainer deps.parseFeedRows(body, meta) shape', () => {
    const csv = readDefaultFixtureCsv();
    const rows = admitadParseFeedRowsHook(csv, {
      source: 'admitad',
      feedKey: 'mrb-hostile',
      env: 'live',
      contentHash: 'abc',
    });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.equal(r.Source, 'admitad');
      assert.equal(r.FeedKey, 'mrb-hostile');
      assert.equal(r.Env, 'live');
      assert.ok(r.MerchantProductId);
      assert.ok(r.Title);
    }
  });

  it('fixture and env.example have no secrets / use example.invalid', () => {
    const csv = readDefaultFixtureCsv();
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'admitad', '.env.example'),
      'utf8',
    );
    assert.match(csv, /example\.invalid/);
    assert.match(envEx, /ADMITAD_FEED_URL=/);
    assert.match(envEx, /ADMITAD_API_KEY=/);
    assert.match(envEx, /ADMITAD_FEED_TOKEN=/);
    const keyLine = envEx.split(/\r?\n/).find((l) => l.startsWith('ADMITAD_API_KEY='));
    assert.equal(keyLine, 'ADMITAD_API_KEY=');
  });

  it('meta.env and meta.feedKey are required', () => {
    assert.throws(
      () => parseAdmitadFeedRows('[]', { source: 'admitad', env: 'sandbox' }),
      /feedKey/,
    );
    assert.throws(
      () =>
        parseAdmitadFeedRows('[]', {
          source: 'admitad',
          feedKey: 'x',
          env: 'prod',
        }),
      /live\|sandbox/,
    );
  });

  it('ADMITAD_FEED_TOKEN alias satisfies assertAdmitadFeedCreds', () => {
    const c = assertAdmitadFeedCreds({ ADMITAD_FEED_TOKEN: ' tok ' });
    assert.equal(c.apiKey, 'tok');
  });

  it('skill documents FR-094 parseFeed + stay-dark; keeps FR-092/093', () => {
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
    assert.match(skill, /## Maintainer feed-parser \(FR-094\)/);
    assert.match(skill, /parseFeed\.js/);
    assert.match(skill, /FR-092/);
    assert.match(skill, /FR-093/);
    assert.match(skill, /stay-dark|enabled\.live\s*=\s*false/i);
  });
});

'use strict';

/**
 * Hostile MRB #718 / FR-077: etsy worker stay-dark + search->normalize->writeResults.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workerPath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  'src',
  'worker.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  '.grok',
  'skills',
  'a-search-etsy',
  'SKILL.md',
);
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  'fixtures',
  'listings-ok.json',
);

describe('mrb718 hostile FR-077 etsy worker', () => {
  it('worker wires search -> normalize -> writeResults; no stub; ASCII header', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!src.includes('\ufffd'));
    assert.ok(!src.includes('<<<<<<'));
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /searchEtsy/);
    assert.match(src, /normalizeSearchResponse/);
    assert.match(src, /writeResults/);
    assert.match(src, /assertWorkerEnv/);
    assert.match(src, /search -> normalize -> writeResults/);
  });

  it('skill documents FR-077; stay-dark registry; no conflict markers', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!skill.includes('<<<<<<'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Worker \(FR-077\)/);
    assert.match(skill, /writeResults/);
    assert.doesNotMatch(skill, /Worker wiring \(FR-077\) is separate/);

    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.equal(et.enabled.live, false);
    assert.equal(et.enabled.sandbox, false);
  });

  it('run end-to-end with fixture inject yields products + description', async () => {
    const { run } = require(workerPath);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const out = await run(
      {
        searchId: 'srch_mrb718',
        userId: 'U1',
        env: 'sandbox',
        source: 'etsy',
        q: 'wallet',
        catalogId: 1,
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          ETSY_API_KEY: 'fixture-key',
          ETSY_TRACKING_ID: 'track-test',
          S3_RESULTS_BUCKET: 'test-results',
        },
        httpRequest: async () => fixture,
        putObject: async () => ({ ETag: '"mrb"' }),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].description, 'Fixture listing A');
    assert.equal(out.products[0].price, 18.5);
  });
});

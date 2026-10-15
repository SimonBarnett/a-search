'use strict';

/**
 * Hostile MRB #722 / FR-081: bol worker stay-dark + search->normalize->writeResults.
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
  'bol',
  'src',
  'worker.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'bol',
  '.grok',
  'skills',
  'a-search-bol',
  'SKILL.md',
);
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'bol',
  'fixtures',
  'products-ok.json',
);

describe('mrb722 hostile FR-081 bol worker', () => {
  it('worker wires search -> normalize -> writeResults; no stub; ASCII header', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!src.includes('\ufffd'));
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /searchBol/);
    assert.match(src, /normalizeSearchResponse/);
    assert.match(src, /writeResults/);
    assert.match(src, /assertWorkerEnv/);
    assert.match(src, /search -> normalize -> writeResults/);
  });

  it('skill documents FR-081; stay-dark registry', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Worker \(FR-081\)/);
    assert.match(skill, /writeResults/);
    assert.doesNotMatch(skill, /Worker wiring \(FR-081\) is a later FR/);

    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.equal(bol.enabled.live, false);
    assert.equal(bol.enabled.sandbox, false);
  });

  it('run end-to-end with fixture inject yields products + seller description', async () => {
    const { run } = require(workerPath);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const out = await run(
      {
        searchId: 'srch_mrb722',
        userId: 'U1',
        env: 'sandbox',
        source: 'bol',
        q: 'earbuds',
        catalogId: 1,
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          BOL_API_KEY: 'fixture-key',
          BOL_TRACKING_ID: 'track-test',
          S3_RESULTS_BUCKET: 'test-results',
        },
        httpRequest: async () => fixture,
        putObject: async () => ({ ETag: '"mrb"' }),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].description, 'Fixture Bol Shop A');
    assert.equal(out.products[0].price, 19.99);
    assert.equal(out.products[0].currency, 'EUR');
  });
});

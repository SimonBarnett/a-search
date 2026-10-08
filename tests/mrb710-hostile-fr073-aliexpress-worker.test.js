'use strict';

/**
 * Hostile MRB #710 / FR-073: aliexpress worker stay-dark + search->normalize->writeResults.
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
  'aliexpress',
  'src',
  'worker.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  '.grok',
  'skills',
  'a-search-aliexpress',
  'SKILL.md',
);
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  'fixtures',
  'products-ok.json',
);

describe('mrb710 hostile FR-073 aliexpress worker', () => {
  it('fixture keeps shop_name from FR-072 keep-both; no conflict markers', () => {
    const raw = fs.readFileSync(fixturePath);
    assert.equal(raw[0], 0x7b, 'UTF-8 no BOM');
    const text = raw.toString('utf8');
    assert.ok(!text.includes('<<<<<<'));
    const fixture = JSON.parse(text);
    assert.equal(
      fixture.aliexpressProductAPI.products[0].shop_name,
      'Fixture AE Shop A',
    );
  });

  it('worker wires search -> normalize -> writeResults; no stub; ASCII header', () => {
    const src = fs.readFileSync(workerPath, 'utf8');
    assert.ok(!src.includes('\ufffd'));
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /searchAliexpress/);
    assert.match(src, /normalizeSearchResponse/);
    assert.match(src, /writeResults/);
    assert.match(src, /assertWorkerEnv/);
    assert.match(src, /search -> normalize -> writeResults/);
  });

  it('skill documents FR-073 worker path; stay-dark registry', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.match(skill, /## Worker \(FR-073\)/);
    assert.match(skill, /writeResults/);
    assert.doesNotMatch(skill, /Worker wiring \(FR-073\) is separate/);

    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.equal(ae.enabled.live, false);
    assert.equal(ae.enabled.sandbox, false);
  });

  it('handler processes one SQS record via run', async () => {
    const { handler } = require(workerPath);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const prev = { ...process.env };
    Object.assign(process.env, {
      A_SEARCH_ENV: 'sandbox',
      ALIEXPRESS_API_KEY: 'fixture-key',
      ALIEXPRESS_TRACKING_ID: 'track-test',
      S3_RESULTS_BUCKET: 'test-results',
    });
    try {
      // handler uses module defaults; inject via run is covered in fr073.
      // Here only assert export shape + that worker module loads clean.
      assert.equal(typeof handler, 'function');
      const { run } = require(workerPath);
      const out = await run(
        {
          searchId: 'srch_mrb710',
          userId: 'U1',
          env: 'sandbox',
          source: 'aliexpress',
          q: 'case',
          catalogId: 1,
        },
        {
          env: {
            A_SEARCH_ENV: 'sandbox',
            ALIEXPRESS_API_KEY: 'fixture-key',
            ALIEXPRESS_TRACKING_ID: 'track-test',
            S3_RESULTS_BUCKET: 'test-results',
          },
          httpRequest: async () => fixture,
          putObject: async () => ({ ETag: '"mrb"' }),
        },
      );
      assert.equal(out.ok, true);
      assert.equal(out.products.length, 2);
      assert.equal(out.products[0].description, 'Fixture AE Shop A');
    } finally {
      for (const k of Object.keys(process.env)) {
        if (!(k in prev)) delete process.env[k];
      }
      Object.assign(process.env, prev);
    }
  });
});

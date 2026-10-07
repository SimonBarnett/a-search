'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  run,
  normalizePart,
} = require('../providers/local/awin/src/worker');

describe('MRB #69 hostile: awin local queryParts products', () => {
  it('default queryParts yields empty products (no live SQL)', async () => {
    const out = await run({
      searchId: 'srch_h',
      env: 'live',
      source: 'awin',
      q: 'x',
    });
    assert.equal(out.ok, true);
    assert.deepEqual(out.products, []);
  });

  it('normalizePart maps MerchantProductId to id', () => {
    const p = normalizePart({
      MerchantProductId: 'SKU',
      Title: 'Name',
      Price: '9.50',
      Source: 'awin',
    });
    assert.equal(p.id, 'SKU');
    assert.equal(p.title, 'Name');
    assert.equal(p.price, 9.5);
    assert.equal(p.source, 'awin');
  });

  it('skill says ingest is maintainer / search reads Parts', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const text = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'providers',
        'local',
        'awin',
        '.grok',
        'skills',
        'a-search-awin',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(text, /maintainer/i);
    assert.match(text, /Parts/i);
  });
});

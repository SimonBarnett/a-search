'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  run,
  normalizePart,
  AwinMssqlConfigError,
} = require('../providers/local/awin/src/worker');

describe('MRB #69 hostile: awin local queryParts products', () => {
  it('default queryParts without MSSQL config fails clearly (FR-043)', async () => {
    await assert.rejects(
      () =>
        run(
          {
            searchId: 'srch_h',
            userId: 'U',
            env: 'live',
            source: 'awin',
            q: 'x',
            catalogId: 1,
          },
          {
            env: {
              A_SEARCH_ENV: 'live',
              S3_RESULTS_BUCKET: 'b',
            },
            putObject: async () => {
              throw new Error('should not put');
            },
          },
        ),
      (err) => err instanceof AwinMssqlConfigError || err.name === 'AwinMssqlConfigError',
    );
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

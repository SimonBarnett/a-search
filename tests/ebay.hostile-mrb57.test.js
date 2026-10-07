'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ebay = path.join(__dirname, '..', 'providers', 'live', 'ebay');

describe('MRB #57 hostile: FR-017 ebay scaffold', () => {
  it('paths exist; run(msg) callable', async () => {
    assert.ok(fs.existsSync(path.join(ebay, 'AGENTS.md')));
    assert.ok(
      fs.existsSync(path.join(ebay, '.grok', 'skills', 'a-search-ebay', 'SKILL.md'))
    );
    const { run } = require('../providers/live/ebay/src/worker');
    const out = await run({
      searchId: 'srch_h',
      userId: 'U1',
      env: 'sandbox',
      source: 'ebay',
      q: 'x',
      catalogId: 1,
      category: 'c',
      subcategory: 's',
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'ebay');
  });

  it('.env.example keeps eBay OAuth secrets in provider env only', () => {
    const text = fs.readFileSync(path.join(ebay, '.env.example'), 'utf8');
    assert.match(text, /EBAY_|CLIENT/i);
    const entryEnv = fs.readFileSync(
      path.join(__dirname, '..', 'entry', '.env.example'),
      'utf8'
    );
    assert.doesNotMatch(entryEnv, /EBAY_CLIENT_SECRET|EBAY_CERT_ID/i);
  });
});

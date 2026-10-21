'use strict';

/**
 * MRB #4456 hostile pins for FR #4450 shared keywordsFromAgentMsg wiring.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  keywordsFromAgentMsg,
  collectQueryTerms,
} = require('../shared/search/keywordsFromAgentMsg');

const LIVE = [
  'amazon',
  'rakuten',
  'kelkoo',
  'etsy',
  'cj',
  'bol',
  'aliexpress',
  'ebay',
];

describe('MRB #4456 hostile FR #4450 agent queries', () => {
  it('shared helper never returns space-only; whitespace queries empty', () => {
    assert.equal(keywordsFromAgentMsg({ queries: ['  ', { q: '\t' }] }), '');
    assert.deepEqual(collectQueryTerms({ queries: ['  ', { q: '' }] }), []);
    assert.equal(keywordsFromAgentMsg({ q: ' ' }), '');
  });

  it('every live search.js requires shared helper and empty-guard before HTTP', () => {
    for (const id of LIVE) {
      const srcPath = path.join(
        __dirname,
        '..',
        'providers',
        'live',
        id,
        'src',
        'search.js',
      );
      const src = fs.readFileSync(srcPath, 'utf8');
      assert.match(
        src,
        /keywordsFromAgentMsg/,
        `${id} must import shared keywordsFromAgentMsg`,
      );
      // Empty keywords must short-circuit.
      // ebay / rakuten fan-out (FR #4450 / #4768) use queryTextsFromMsg length.
      if (id === 'ebay' || id === 'rakuten') {
        assert.match(src, /queryTextsFromMsg/);
        assert.match(
          src,
          /if\s*\(\s*!texts\.length\s*\)/,
          `${id} must return [] before HTTP when keywords empty`,
        );
      } else {
        assert.match(
          src,
          /if\s*\(\s*!keywordsFromMsg\(msg\)\s*\)\s*return\s*\[\s*\]/,
          `${id} must return [] before HTTP when keywords empty`,
        );
      }
    }
  });

  it('cj searchCj skips HTTP when queries empty', async () => {
    const { searchCj } = require('../providers/live/cj/src/search');
    const calls = [];
    const out = await searchCj(
      { queries: [], env: 'sandbox' },
      {
        env: {
          CJ_API_TOKEN: 'FAKE_token',
          CJ_COMPANY_ID: '1',
          CJ_WEBSITE_ID: '2',
        },
        httpRequest: async (req) => {
          calls.push(req);
          return { data: { products: { resultList: [] } } };
        },
      },
    );
    assert.deepEqual(out, []);
    assert.equal(calls.length, 0);
  });
});

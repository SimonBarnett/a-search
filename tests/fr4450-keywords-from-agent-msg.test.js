'use strict';

/**
 * FR #4450: shared agent queries/exclude → keyword string for live providers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  keywordsFromAgentMsg,
  collectQueryTerms,
  collectExcludeTerms,
} = require('../shared/search/keywordsFromAgentMsg');

describe('FR #4450 keywordsFromAgentMsg', () => {
  it('reads string queries and {q} objects', () => {
    assert.equal(
      keywordsFromAgentMsg({ queries: ['model aircraft', 'servo'] }),
      'model aircraft servo',
    );
    assert.equal(
      keywordsFromAgentMsg({ queries: [{ q: 'brushless motor' }] }),
      'brushless motor',
    );
  });

  it('applies exclude as minus terms (title:match stripped)', () => {
    const q = keywordsFromAgentMsg({
      queries: ['model flying'],
      exclude: [{ match: 'title:spam' }, 'used'],
    });
    assert.match(q, /model flying/);
    assert.match(q, /-spam/);
    assert.match(q, /-used/);
  });

  it('keeps legacy q and searchterms', () => {
    assert.equal(keywordsFromAgentMsg({ q: 'legacy boots' }), 'legacy boots');
    assert.equal(
      keywordsFromAgentMsg({ searchterms: ['a', 'b'] }),
      'a b',
    );
  });

  it('prefers queries over legacy q', () => {
    assert.equal(
      keywordsFromAgentMsg({ queries: ['from-queries'], q: 'legacy' }),
      'from-queries',
    );
  });

  it('returns empty when nothing usable (never blank space)', () => {
    assert.equal(keywordsFromAgentMsg({}), '');
    assert.equal(keywordsFromAgentMsg({ queries: [] }), '');
    assert.equal(keywordsFromAgentMsg({ q: '   ' }), '');
    assert.deepEqual(collectQueryTerms({ exclude: ['x'] }), []);
    assert.deepEqual(collectExcludeTerms({ exclude: ['x'] }), ['x']);
  });
});

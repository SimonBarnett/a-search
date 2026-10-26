'use strict';

/**
 * FR #5106: SQL gate must not admit gloves/T-shirts on Cub/Wolf alone.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractBrandModelGateTokens,
  admitRowsByExactGates,
  defaultQueryParts,
  isBrandLikeToken,
  GATE_GENERIC_WORDS,
} = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

const APPAREL_FALSE_FRIENDS = [
  {
    Title:
      "Children's Gloves TPE Palm Coating with Cub Paw Print Design Soft Durable",
    Description: 'kids gloves cotton',
  },
  {
    Title: 'WOLF GUARDIAN - Longsleeve T-Shirt Black',
    Description: 'cotton tee',
  },
  {
    Title: 'WOLF GUARDIAN - Longsleeve T-Shirt Black',
    Description: 'duplicate wolf shirt',
  },
];

const RC_HIT = {
  Title: 'Volantex Sport Cub S2 761-14 RTF',
  Description: 'Beginner RC trainer with Xpilot gyro',
};

/**
 * @param {object} msg
 * @param {object[]} fixtureRows
 */
function mockQueryParts(msg, fixtureRows) {
  return defaultQueryParts(msg, {
    env: {
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_USER: 'a_search_drain',
      A_SEARCH_SQL_TOP: '500',
      A_SEARCH_SQL_MIN_RANK: '1',
    },
    sqlTypes: {
      NVarChar: (n) => ({ kind: 'NVarChar', length: n }),
      Int: 'Int',
    },
    connect: async () => ({
      request() {
        return {
          input() {
            return this;
          },
          async query() {
            // Simulate a loose SQL CONTAINS that returns apparel on shared words.
            return { recordset: fixtureRows };
          },
        };
      },
      close() {},
    }),
  });
}

describe('FR #5106 brand/model gate false friends', () => {
  it('Cub and Wolf are generic; short ALLCAPS WOLF is not brand-like', () => {
    assert.equal(GATE_GENERIC_WORDS.has('cub'), true);
    assert.equal(GATE_GENERIC_WORDS.has('wolf'), true);
    assert.equal(isBrandLikeToken('WOLF'), false);
    assert.equal(isBrandLikeToken('Cub'), false);
    assert.equal(isBrandLikeToken('Wolf'), false);
    assert.equal(isBrandLikeToken('Xpilot'), true);
    assert.equal(isBrandLikeToken('VOLANTEXRC'), true);
  });

  it('Sport Cub phrase remains a gate; cub/wolf alone never do', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
    });
    assert.ok(
      gates.some((g) => /sport\s+cub/i.test(g)),
      String(gates),
    );
    assert.equal(gates.includes('"cub*"'), false);
    assert.equal(gates.includes('"Cub"'), false);
    assert.equal(gates.includes('"wolf*"'), false);
    assert.deepEqual(extractBrandModelGateTokens({ queries: ['Cub'] }), []);
    assert.deepEqual(extractBrandModelGateTokens({ queries: ['WOLF'] }), []);
  });

  it('admitRowsByExactGates rejects apparel; keeps Volantex Sport Cub', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
    });
    const admitted = admitRowsByExactGates(
      [...APPAREL_FALSE_FRIENDS, RC_HIT],
      gates,
    );
    assert.equal(admitted.length, 1);
    assert.match(String(admitted[0].Title), /Volantex Sport Cub/i);
  });

  it('loose SQL rows of only gloves/T-shirts admit 0 products', async () => {
    const rows = await mockQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      APPAREL_FALSE_FRIENDS,
    );
    assert.equal(rows.length, 0);
  });

  it('docs mention FR #5106 apparel false-friend / post-admit', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5106|#5106/);
    assert.match(text, /admitRowsByExactGates|post-admit|false.?friend/i);
  });
});

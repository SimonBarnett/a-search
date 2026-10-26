'use strict';

/**
 * FR #5121: colour words (Yellow) and bare sizes (615mm) must not be brand/model
 * gates that admit Cub Paw gloves after #5109.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const {
  extractBrandModelGateTokens,
  admitRowsByExactGates,
  defaultQueryParts,
  isBrandLikeToken,
  isModelNumberToken,
  GATE_GENERIC_WORDS,
} = require('../providers/local/sql/src/queryParts');

const GLOVE = {
  Title:
    "Children's Gloves TPE Palm Coating with Cub Paw Print Design 1 Pair Size 4 Yellow/Grey KDZGGY-4",
  Description: 'kids gloves cotton yellow grey',
  id: 478281,
};

const EFLITE_Q =
  'E-flite UMX Waco Yellow EFLU53550Y AS3X United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';
const VOLANTEX_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom GBP';
const HOBBYZONE_Q =
  'HobbyZone Carbon Cub S2 1.3m RTF 615mm United Kingdom GBP';

const RC_EFLITE = {
  Title: 'E-flite UMX Waco Yellow EFLU53550Y BNF',
  Description: 'AS3X micro biplane',
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
            return { recordset: fixtureRows };
          },
        };
      },
      close() {},
    }),
  });
}

describe('FR #5121 colour and size false friends', () => {
  it('Yellow and other colours are generic; not brand-like', () => {
    assert.equal(GATE_GENERIC_WORDS.has('yellow'), true);
    assert.equal(GATE_GENERIC_WORDS.has('grey'), true);
    assert.equal(GATE_GENERIC_WORDS.has('gray'), true);
    assert.equal(isBrandLikeToken('Yellow'), false);
    assert.equal(isBrandLikeToken('Grey'), false);
    assert.equal(isBrandLikeToken('EFLU53550Y'), false); // model number path
  });

  it('bare dimensions like 615mm are not model-number gates', () => {
    assert.equal(isModelNumberToken('615mm'), false);
    assert.equal(isModelNumberToken('12cm'), false);
    assert.equal(isModelNumberToken('EFLU53550Y'), true);
    assert.equal(isModelNumberToken('761-14'), true);
  });

  it('E-flite query: no yellow* gate; keeps EFLU53550Y and Waco Yellow phrase', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: EFLITE_Q, maxResults: 10 }],
    });
    assert.equal(gates.includes('"yellow*"'), false, String(gates));
    assert.equal(gates.includes('"Yellow"'), false, String(gates));
    assert.ok(
      gates.some((g) => /EFLU53550Y/i.test(g)),
      String(gates),
    );
    assert.ok(
      gates.some((g) => /waco\s+yellow/i.test(g)),
      String(gates),
    );
  });

  it('HobbyZone query: no 615mm gate', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: HOBBYZONE_Q, maxResults: 10 }],
    });
    assert.equal(gates.includes('"615mm"'), false, String(gates));
    assert.ok(
      gates.some((g) => /hobbyzone/i.test(g)),
      String(gates),
    );
  });

  it('glove row rejected for E-flite, VOLANTEXRC, and HobbyZone queries', async () => {
    for (const q of [EFLITE_Q, VOLANTEX_Q, HOBBYZONE_Q]) {
      const gates = extractBrandModelGateTokens({
        queries: [{ q, maxResults: 10 }],
      });
      const admitted = admitRowsByExactGates([GLOVE], gates);
      assert.equal(
        admitted.length,
        0,
        `q=${q.slice(0, 40)} gates=${gates.join(',')} admitted=${JSON.stringify(admitted)}`,
      );
      const rows = await mockQueryParts(
        { env: 'live', queries: [{ q, maxResults: 10 }] },
        [GLOVE],
      );
      assert.equal(rows.length, 0, q.slice(0, 40));
    }
  });

  it('real E-flite Waco Yellow row still admitted', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: EFLITE_Q, maxResults: 10 }],
    });
    const admitted = admitRowsByExactGates([GLOVE, RC_EFLITE], gates);
    assert.equal(admitted.length, 1);
    assert.match(String(admitted[0].Title), /E-flite UMX Waco Yellow/i);
  });

  it('docs mention FR #5121 colour/size gate', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5121|#5121/);
    assert.match(text, /colour|color|615mm|dimension/i);
  });
});

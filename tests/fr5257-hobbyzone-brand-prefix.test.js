'use strict';

/**
 * FR #5257: hobbyzone* brand prefix is too loose (furniture). Require a
 * model phrase/number with that brand, or return no gates.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  extractBrandModelGateTokens,
  admitRowsByExactGates,
  defaultQueryParts,
} = require('../providers/local/sql/src/queryParts');

describe('FR #5257 hobbyzone brand prefix', () => {
  it('Hobbyzone-only query yields no gates (too loose)', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: 'Hobbyzone paint stand', maxResults: 10 }],
    });
    assert.equal(gates.some((g) => /hobbyzone\*/i.test(g)), false, String(gates));
    assert.equal(gates.length, 0, String(gates));
  });

  it('Hobbyzone plus model phrase keeps the phrase, not hobbyzone*', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: 'HobbyZone Carbon Cub S2', maxResults: 10 }],
    });
    assert.ok(
      gates.some((g) => /carbon\s+cub/i.test(g)),
      String(gates),
    );
    assert.equal(gates.some((g) => /hobbyzone\*/i.test(g)), false, String(gates));
  });

  it('VOLANTEXRC annotator still keeps volantex* with model gates', () => {
    const gates = extractBrandModelGateTokens({
      queries: [
        {
          q: 'VOLANTEXRC Sport Cub S2 761-14',
          maxResults: 10,
        },
      ],
    });
    assert.ok(gates.some((g) => /^"volantex\*"$/i.test(g)), String(gates));
    assert.ok(gates.some((g) => /^"sport cub"$/i.test(g)), String(gates));
  });

  it('admitRows drops Hobbyzone furniture when gates are model-only', () => {
    const rows = [
      { Title: 'Hobbyzone Wooden Paint Stand', Description: 'hobby furniture' },
      { Title: 'HobbyZone Carbon Cub S2 RTF', Description: 'RC trainer' },
    ];
    const gates = extractBrandModelGateTokens({
      queries: [{ q: 'HobbyZone Carbon Cub', maxResults: 10 }],
    });
    const admitted = admitRowsByExactGates(rows, gates);
    assert.equal(admitted.some((r) => /paint stand/i.test(r.Title)), false);
    assert.equal(admitted.some((r) => /carbon cub/i.test(r.Title)), true);
  });

  it('defaultQueryParts returns 0 for Hobbyzone-only (no SELECT)', async () => {
    let connected = false;
    const rows = await defaultQueryParts(
      { env: 'live', queries: [{ q: 'Hobbyzone easel', maxResults: 10 }] },
      {
        env: {
          MSSQL_SERVER: 'walrus\\ASEARCH',
          MSSQL_DATABASE: 'a_search',
          MSSQL_USER: 'a_search_drain',
        },
        sqlTypes: {
          NVarChar: (n) => ({ kind: 'NVarChar', length: n }),
          Int: 'Int',
        },
        connect: async () => {
          connected = true;
          return { request() { return { input() { return this; }, async query() { return { recordset: [] }; } }; }, close() {} };
        },
      },
    );
    assert.equal(connected, false);
    assert.equal(rows.length, 0);
  });

  it('docs mention FR #5257 hobbyzone prefix', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /5257/);
    assert.match(text, /hobbyzone/i);
  });
});

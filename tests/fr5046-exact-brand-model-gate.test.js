'use strict';

/**
 * FR #5046: exact brand/model CONTAINS gate; FREETEXT orders only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractBrandModelGateTokens,
  buildSelectSql,
  buildFreetextQuery,
  defaultQueryParts,
  GATE_GENERIC_WORDS,
} = require('../providers/local/sql/src/queryParts');

const ANNOTATOR_Q =
  'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP';

const JUNK_ROWS = [
  { Title: 'Cubs Athletic Crew Socks Pack', Description: 'cotton socks' },
  { Title: 'Galaxy Watch S2 Sport Strap', Description: 'watch band' },
  { Title: 'Yoga Mat Beginner RTF Blue', Description: 'exercise mat' },
  { Title: 'Kids Roller Skates Size 3CH', Description: 'skates' },
  { Title: 'Juniper Networks Support SKU', Description: 'support contract' },
];

/**
 * Simulate CONTAINS gate admission (prefix * / exact phrase / model number).
 * @param {object[]} rows
 * @param {string[]} gates CONTAINS forms like `"volantex*"`
 * @returns {object[]}
 */
function filterRowsByGates(rows, gates) {
  const specs = (gates || []).map((g) => {
    const inner = String(g || '').replace(/^"|"$/g, '');
    const prefix = inner.endsWith('*');
    const needle = prefix ? inner.slice(0, -1) : inner;
    return { needle: needle.toLowerCase(), prefix };
  });
  return rows.filter((row) => {
    const hay = `${row.Title || ''} ${row.Description || ''}`.toLowerCase();
    return specs.some((s) => {
      if (!s.needle) return false;
      if (s.prefix) {
        // Word starting with brand prefix
        return new RegExp(
          `(^|[^a-z0-9])${s.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9]*`,
          'i',
        ).test(hay);
      }
      return hay.includes(s.needle);
    });
  });
}

/**
 * @param {object} msg
 * @param {object[]} fixtureRows
 */
function mockQueryParts(msg, fixtureRows) {
  /** @type {Record<string, unknown>} */
  const inputs = {};
  let sqlText = '';
  return defaultQueryParts(msg, {
    env: {
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_USER: 'a_search_drain',
      A_SEARCH_SQL_TOP: '500',
      A_SEARCH_SQL_MIN_RANK: '50',
    },
    sqlTypes: {
      NVarChar: (n) => ({ kind: 'NVarChar', length: n }),
      Int: 'Int',
    },
    connect: async () => ({
      request() {
        return {
          input(name, _type, value) {
            inputs[name] = value;
            return this;
          },
          async query(text) {
            sqlText = text;
            const gates = Object.keys(inputs)
              .filter((k) => /^gate\d+$/.test(k))
              .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
              .map((k) => String(inputs[k]));
            const n = Number(inputs.n) || 0;
            const matched = filterRowsByGates(fixtureRows, gates).slice(0, n);
            return { recordset: matched };
          },
        };
      },
      close() {},
    }),
  }).then((rows) => ({ rows, inputs, sqlText }));
}

describe('FR #5046 extractBrandModelGateTokens', () => {
  it('VOLANTEXRC annotator query yields brand prefix, model phrase, model number', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
    });
    assert.ok(gates.some((g) => /^"volantex\*"$/i.test(g)), String(gates));
    assert.ok(
      gates.some((g) => /^"sport cub"$/i.test(g)),
      `expected sport cub in ${gates}`,
    );
    assert.ok(gates.includes('"761-14"'), String(gates));
    // Generics alone must not appear as gates
    for (const bad of ['"S2"', '"s2"', '"3CH"', '"RTF"', '"beginner"', '"sport"']) {
      assert.equal(gates.includes(bad), false, bad);
    }
    assert.ok(GATE_GENERIC_WORDS.has('rtf'));
    assert.ok(GATE_GENERIC_WORDS.has('beginner'));
  });

  it('prefers structured brand/model/modelNumber on query objects', () => {
    const gates = extractBrandModelGateTokens({
      queries: [
        {
          q: 'ignored filler text for fan-out',
          brand: 'HobbyZone',
          model: 'Carbon Cub',
          modelNumber: 'HBZ3200',
        },
      ],
    });
    assert.ok(gates.some((g) => /^"hobbyzone\*"$/i.test(g)), String(gates));
    assert.ok(gates.some((g) => /carbon cub/i.test(g)), String(gates));
    assert.ok(gates.some((g) => /HBZ3200/i.test(g)), String(gates));
  });

  it('bare category word with no brand/model yields zero gates', () => {
    assert.deepEqual(extractBrandModelGateTokens({ queries: ['servo'] }), []);
    assert.deepEqual(
      extractBrandModelGateTokens({ queries: ['the and or beginner'] }),
      [],
    );
  });
});

describe('FR #5046 SQL gate + mock fixtures', () => {
  it('buildSelectSql ORs CONTAINS @gateN and keeps @minRank / excludes', () => {
    const sql = buildSelectSql(1, 3);
    assert.match(sql, /FREETEXTTABLE/);
    assert.match(sql, /ft\.\[RANK\]\s*>=\s*@minRank/);
    assert.match(sql, /CONTAINS\(\(p\.Title, p\.Description\), @gate0\)/);
    assert.match(sql, /OR CONTAINS\(\(p\.Title, p\.Description\), @gate1\)/);
    assert.match(sql, /@gate2/);
    assert.match(sql, /AND NOT CONTAINS\(\(p\.Title, p\.Description\), @ex0\)/);
  });

  it('junk-only fixture returns 0 products for VOLANTEXRC query', async () => {
    const { rows, inputs, sqlText } = await mockQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      JUNK_ROWS,
    );
    assert.ok(Object.keys(inputs).some((k) => /^gate\d+$/.test(k)));
    assert.match(sqlText, /@gate0/);
    assert.match(String(inputs.gate0), /volantex/i);
    assert.equal(rows.length, 0);
    for (const row of rows) {
      assert.doesNotMatch(String(row.Title), /sock|watch|yoga|skate|juniper/i);
    }
  });

  it('fixture with Volantex Sport Cub row returns it; socks never', async () => {
    const fixture = [
      ...JUNK_ROWS,
      {
        Title: 'Volantex Sport Cub S2 761-14 RTF',
        Description: 'Beginner RC trainer with Xpilot',
      },
    ];
    const { rows } = await mockQueryParts(
      { env: 'live', queries: [{ q: ANNOTATOR_Q, maxResults: 10 }] },
      fixture,
    );
    assert.equal(rows.length, 1);
    assert.match(String(rows[0].Title), /Volantex Sport Cub/i);
    for (const row of rows) {
      assert.doesNotMatch(String(row.Title), /socks|Galaxy Watch|Yoga Mat/i);
    }
  });

  it('zero gate tokens skips connect (never FREETEXT-only)', async () => {
    let connected = false;
    const rows = await defaultQueryParts(
      { env: 'live', queries: ['servo'] },
      {
        env: { MSSQL_SERVER: 'walrus\\ASEARCH', MSSQL_DATABASE: 'a_search' },
        connect: async () => {
          connected = true;
          return { request() {}, close() {} };
        },
      },
    );
    assert.deepEqual(rows, []);
    assert.equal(connected, false);
    assert.equal(buildFreetextQuery({ queries: ['servo'] }).length > 0, true);
  });

  it('docs document FR #5046 exact brand/model gate heuristic', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5046|#5046/);
    assert.match(text, /exact brand|brand\/model|CONTAINS/i);
    assert.match(text, /volantex\*|Sport Cub|761-14/i);
    assert.match(text, /no results|0 products|empty/i);
    assert.equal(text.charCodeAt(0) === 0xfeff, false);
  });

  it(
    'optional local: VOLANTEXRC annotator query returns 0 rows',
    {
      skip:
        process.env.A_SEARCH_SQL_INTEGRATION === '1'
          ? false
          : 'set A_SEARCH_SQL_INTEGRATION=1',
    },
    async () => {
      const rows = await defaultQueryParts(
        {
          env: 'live',
          queries: [{ q: ANNOTATOR_Q, maxResults: 10 }],
        },
        { env: process.env },
      );
      assert.equal(rows.length, 0);
    },
  );
});

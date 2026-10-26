'use strict';

/**
 * FR #4976: IN/sql.json overwrite + CONTAINS OR / AND NOT + TOP + empty queries.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runDrainJob } = require('../walrus/src/runJob');
const { aClubsInAbsPath } = require('../walrus/src/aClubsInPath');
const { validateInResult } = require('../shared/search/inResultSchema');
const {
  SELECT_SQL,
  buildContainsQuery,
  sqlTopLimit,
  defaultQueryParts,
} = require('../providers/local/sql/src/queryParts');
const { sqlInResultKey } = require('../providers/local/sql/src/worker');

const ROOT = path.join(__dirname, '..');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a-clubs-4976-'));
}

function sampleRow() {
  return {
    Source: 'awin',
    FeedKey: 'fk1',
    MerchantProductId: 'mp-1',
    Env: 'live',
    // FR #5106: post-admit exact gates drop rows that lack the brand/model needle
    // (VOLANTEXRC → volantex* gate). Keep a legitimate brand hit for SQL binding asserts.
    Title: 'VOLANTEXRC Servo arm',
    Description: 'test part',
    Url: 'https://example.test/p/1',
    ImageUrl: 'https://example.test/i/1.jpg',
    Price: 9.99,
    Currency: 'GBP',
    Stock: '1',
  };
}

describe('FR #4976 contains + TOP helpers', () => {
  it('joins queries as FREETEXT natural language (excludes are separate params)', () => {
    const { buildFreetextQuery } = require('../providers/local/sql/src/queryParts');
    assert.equal(
      buildFreetextQuery({
        queries: [{ q: 'model aircraft' }, 'servo'],
        exclude: [{ match: 'title:calendar' }],
      }),
      'model aircraft servo',
    );
  });

  it('sqlTopLimit defaults to 500 and reads A_SEARCH_SQL_TOP', () => {
    assert.equal(sqlTopLimit({}), 500);
    assert.equal(sqlTopLimit({ A_SEARCH_SQL_TOP: '250' }), 250);
    assert.equal(sqlTopLimit({ A_SEARCH_SQL_TOP: '0' }), 500);
  });

  it('SELECT_SQL is FREETEXTTABLE + TOP (@n) + RANK, SELECT-only', () => {
    assert.match(SELECT_SQL, /SELECT\s+TOP\s+\(@n\)/i);
    assert.match(SELECT_SQL, /FREETEXTTABLE/i);
    assert.match(SELECT_SQL, /ORDER BY\s+ft\.\[RANK\]/i);
    assert.doesNotMatch(SELECT_SQL, /\bLIKE\b/i);
    assert.doesNotMatch(SELECT_SQL, /\b(INSERT|UPDATE|DELETE|MERGE)\b/i);
  });

  it('empty queries skip the SQL round-trip', async () => {
    let connected = false;
    const rows = await defaultQueryParts(
      { env: 'live', queries: [] },
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
  });

  it('passes @q @top @n and phrase @ex0 into FREETEXTTABLE SQL', async () => {
    /** @type {Record<string, unknown>} */
    const inputs = {};
    /** @type {Record<string, unknown>} */
    const types = {};
    let sqlText = '';
    const rows = await defaultQueryParts(
      // FR #5046: brand/model gate required (bare servo/arm would skip SELECT)
      { env: 'live', queries: ['VOLANTEXRC', 'servo'], exclude: ['junkxx'] },
      {
        env: {
          MSSQL_SERVER: 'walrus\\ASEARCH',
          MSSQL_DATABASE: 'a_search',
          MSSQL_USER: 'a_search_drain',
          A_SEARCH_SQL_TOP: '12',
        },
        sqlTypes: { NVarChar: 'NVarChar', Int: 'Int' },
        connect: async () => ({
          request() {
            return {
              input(name, type, value) {
                inputs[name] = value;
                types[name] = type;
                return this;
              },
              async query(text) {
                sqlText = text;
                return { recordset: [sampleRow()] };
              },
            };
          },
          close() {},
        }),
      },
    );
    assert.equal(rows.length, 1);
    assert.equal(inputs.q, 'VOLANTEXRC servo');
    assert.equal(inputs.ex0, '"junkxx"');
    assert.equal(inputs.n, 12);
    assert.equal(inputs.top, 12);
    assert.match(sqlText, /FREETEXTTABLE/);
    assert.match(sqlText, /@ex0/);
    assert.match(sqlText, /@gate0/);
    assert.equal(Object.prototype.hasOwnProperty.call(inputs, 'like'), false);
  });
});

describe('FR #4976 IN/sql.json overwrite', () => {
  it('sqlInResultKey is host/guid/IN/sql.json', () => {
    assert.equal(
      sqlInResultKey({
        hostkey: 'www.mymodelflyingclub.co.uk',
        guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
      }),
      'www.mymodelflyingclub.co.uk/de986521-72d8-4d55-8da3-12ca524d8d74/IN/sql.json',
    );
  });

  it('drain overwrites an existing IN/sql.json', async () => {
    const root = tmpRoot();
    const host = 'www.mymodelflyingclub.co.uk';
    const guid = 'de986521-72d8-4d55-8da3-12ca524d8d74';
    const abs = aClubsInAbsPath({ root, host, guid, searchId: 'sql' });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '{"stale":true}\n', 'utf8');

    await runDrainJob(
      {
        source: 'sql',
        searchid: 'srch_one',
        host,
        hostkey: host,
        guid,
        widgetGuid: guid,
        env: 'live',
        queries: ['servo'],
      },
      {
        aClubsRoot: root,
        repoRoot: ROOT,
        envVars: {
          MSSQL_DATABASE: 'a_search',
          A_SEARCH_ENV: 'live',
          A_CLUBS_ROOT: root,
        },
        queryParts: async () => [sampleRow()],
        touchLastmod: async () => {},
      },
    );

    const body = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const validated = validateInResult(body);
    assert.equal(validated.ok, true, JSON.stringify(validated));
    assert.equal(validated.value.searchid, 'srch_one');
    assert.equal(validated.value.source, 'sql');
    assert.equal(body.stale, undefined);
    assert.ok(validated.value.products.length >= 1);
    const staleName = path.join(path.dirname(abs), 'srch_one-sql.json');
    assert.equal(fs.existsSync(staleName), false);
  });
});

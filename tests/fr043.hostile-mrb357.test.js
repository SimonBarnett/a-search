'use strict';

/** MRB #357 hostile pins for FR-043 awin MSSQL queryParts */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SELECT_SQL,
  searchTextFromMsg,
  mssqlConfigFromEnv,
  AwinMssqlConfigError,
  defaultQueryParts,
} = require('../providers/local/awin/src/queryParts');
const { normalizePart, run } = require('../providers/local/awin/src/worker');

describe('MRB #357 hostile: FR-043 awin queryParts', () => {
  it('SELECT_SQL pins Source=awin, Env, DeletedAt, Title/Description LIKE', () => {
    assert.match(SELECT_SQL, /Source = N'awin'/);
    assert.match(SELECT_SQL, /Env = @env/);
    assert.match(SELECT_SQL, /DeletedAt IS NULL/);
    assert.match(SELECT_SQL, /Title LIKE @like/);
    assert.match(SELECT_SQL, /Description LIKE @like/);
    assert.match(SELECT_SQL, /@q = N''/);
  });

  it('searchTextFromMsg prefers q then searchterms array/string', () => {
    assert.equal(searchTextFromMsg({ q: '  a  ' }), 'a');
    assert.equal(searchTextFromMsg({ searchterms: ['x', 'y'] }), 'x y');
    assert.equal(searchTextFromMsg({ searchterms: 'z' }), 'z');
    assert.equal(searchTextFromMsg({}), '');
  });

  it('mssqlConfigFromEnv requires server+database; user unless trusted', () => {
    assert.throws(
      () => mssqlConfigFromEnv({}),
      (e) => e instanceof AwinMssqlConfigError,
    );
    assert.throws(
      () =>
        mssqlConfigFromEnv({
          MSSQL_SERVER: 's',
          MSSQL_DATABASE: 'd',
        }),
      (e) => e instanceof AwinMssqlConfigError,
    );
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 's',
      MSSQL_DATABASE: 'd',
      MSSQL_USER: 'u',
      MSSQL_PASSWORD: 'p',
    });
    assert.equal(cfg.server, 's');
    assert.equal(cfg.user, 'u');
  });

  it('defaultQueryParts strips LIKE wildcards from user q', async () => {
    const inputs = {};
    await defaultQueryParts(
      { env: 'sandbox', q: 'a%b_c' },
      {
        env: {
          MSSQL_SERVER: 's',
          MSSQL_DATABASE: 'd',
          MSSQL_USER: 'u',
        },
        sqlTypes: { NVarChar: 'NVarChar' },
        connect: async () => ({
          request() {
            const api = {
              input(name, _t, value) {
                inputs[name] = value;
                return api;
              },
              async query() {
                return { recordset: [] };
              },
            };
            return api;
          },
          async close() {},
        }),
      },
    );
    assert.equal(inputs.q, 'a%b_c');
    assert.equal(inputs.like, '%abc%');
  });

  it('normalizePart always sets id/title/source; MerchantProductId coerced', () => {
    const p = normalizePart({
      MerchantProductId: 99,
      Title: null,
      Source: 'awin',
      Description: 'extra',
      FeedKey: 'fk',
      Stock: 'in',
    });
    assert.equal(String(p.id), '99');
    assert.equal(p.title, '');
    assert.equal(p.source, 'awin');
    // ACCEPTABLE until FR-042 #356 merges: local extras may sit top-level
    assert.equal(p.description, 'extra');
  });

  it('skill pins never silent empty without SQL module', () => {
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
    assert.match(text, /AwinMssqlConfigError|awin_mssql_missing_config/);
    assert.match(text, /never silent/i);
  });

  it('wrong-env still blocked before SQL', async () => {
    await assert.rejects(
      () =>
        run(
          {
            searchId: 's',
            userId: 'u',
            env: 'live',
            source: 'awin',
            q: 'x',
            catalogId: 1,
          },
          {
            env: {
              A_SEARCH_ENV: 'sandbox',
              MSSQL_SERVER: 's',
              MSSQL_DATABASE: 'd',
              MSSQL_USER: 'u',
              S3_RESULTS_BUCKET: 'b',
            },
            connect: async () => {
              throw new Error('should not connect');
            },
            putObject: async () => {
              throw new Error('should not put');
            },
          },
        ),
      (err) => err && err.code === 'env_mismatch',
    );
  });
});
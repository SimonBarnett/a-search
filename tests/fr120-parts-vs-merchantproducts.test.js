'use strict';

/** FR-120: Parts vs MerchantProducts decision + missing_table selftest */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { isMissingTableError } = require('../shared/mssql/isMissingTableError');
const {
  SELECT_SQL: awinSelect,
  defaultQueryParts,
} = require('../providers/local/awin/src/queryParts');
const { SELECT_SQL: impactSelect } = require('../providers/local/impact/src/queryParts');
const {
  probeAwinSelftest,
  PROBE_SQL: awinProbeSql,
} = require('../providers/local/awin/src/selftestProbe');
const {
  probeImpactSelftest,
  PROBE_SQL: impactProbeSql,
} = require('../providers/local/impact/src/selftestProbe');

describe('FR-120 decision record', () => {
  it('parts-maintainer.md chooses (a) dbo.Parts and rejects MerchantProducts', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'parts-maintainer.md'),
      'utf8',
    );
    assert.match(text, /## Decision \(FR-120\)/);
    assert.match(text, /Chosen: \(a\)/i);
    assert.match(text, /Rejected: \(b\)/i);
    assert.match(text, /dbo\.Parts/);
    assert.match(text, /MerchantProducts/);
    assert.match(text, /runtime never runs DDL/i);
    assert.match(text, /missing_table/);
  });

  it('vision UNKNOWN resolves table ownership to FR-120 option a', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'vision.md'), 'utf8');
    assert.match(text, /FR-120/);
    assert.match(text, /owns/i);
    assert.match(text, /dbo\.Parts/);
    assert.match(text, /not `dbo\.MerchantProducts`|not dbo\.MerchantProducts/i);
  });

  it('maintainer/sql README says ops-applied / no runtime DDL', () => {
    const text = fs.readFileSync(
      path.join(root, 'maintainer', 'sql', 'README.md'),
      'utf8',
    );
    assert.match(text, /FR-120/);
    assert.match(text, /runtime never runs/i);
    assert.match(text, /dbo\.Parts/);
    assert.match(text, /not[\s\S]{0,20}read[\s\S]{0,80}MerchantProducts/i);
  });
});

describe('FR-120 SELECT targets dbo.Parts', () => {
  it('awin and impact queryParts SELECT dbo.Parts columns', () => {
    assert.match(awinSelect, /FROM dbo\.Parts\b/);
    assert.match(awinSelect, /MerchantProductId/);
    assert.match(awinSelect, /Env/);
    assert.match(awinSelect, /DeletedAt IS NULL/);
    assert.doesNotMatch(awinSelect, /MerchantProducts/i);
    assert.match(impactSelect, /FROM dbo\.Parts\b/);
    assert.doesNotMatch(impactSelect, /MerchantProducts/i);
  });

  it('selftest probes target dbo.Parts', () => {
    assert.match(awinProbeSql, /FROM dbo\.Parts\b/);
    assert.match(impactProbeSql, /FROM dbo\.Parts\b/);
  });

  it('defaultQueryParts does not emit DDL', async () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'awin', 'src', 'queryParts.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /\bCREATE\s+TABLE\b/i);
    assert.doesNotMatch(src, /\bALTER\s+TABLE\b/i);
    assert.doesNotMatch(src, /\bDROP\s+TABLE\b/i);
    let sawSql = '';
    await defaultQueryParts(
      { env: 'live', q: 'x' },
      {
        env: {
          A_SEARCH_ENV: 'live',
          MSSQL_SERVER: 'sql.test',
          MSSQL_DATABASE: 'madeiradb',
          MSSQL_USER: 'u',
          MSSQL_PASSWORD: 'p',
        },
        sqlTypes: { NVarChar: 'NVarChar' },
        connect: async () => ({
          request() {
            const api = {
              input() {
                return api;
              },
              async query(sqlText) {
                sawSql = String(sqlText);
                return { recordset: [] };
              },
            };
            return api;
          },
          async close() {},
        }),
      },
    );
    assert.match(sawSql, /FROM dbo\.Parts\b/);
    assert.doesNotMatch(sawSql, /\bCREATE\b/i);
  });
});

describe('FR-120 missing_table selftest code', () => {
  it('isMissingTableError detects Invalid object name / 208', () => {
    assert.equal(
      isMissingTableError({
        number: 208,
        message: "Invalid object name 'dbo.Parts'.",
      }),
      true,
    );
    assert.equal(
      isMissingTableError(new Error("Invalid object name 'dbo.Parts'.")),
      true,
    );
    assert.equal(isMissingTableError(new Error('ECONNREFUSED')), false);
  });

  it('awin probe returns missing_table when Parts absent', async () => {
    const result = await probeAwinSelftest({
      env: {
        A_SEARCH_ENV: 'live',
        MSSQL_SERVER: 'sql.test',
        MSSQL_DATABASE: 'madeiradb',
        MSSQL_USER: 'u',
        MSSQL_PASSWORD: 'p',
      },
      connect: async () => ({
        request() {
          return {
            async query() {
              const err = new Error("Invalid object name 'dbo.Parts'.");
              /** @type {any} */ (err).number = 208;
              throw err;
            },
          };
        },
        async close() {},
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'missing_table');
  });

  it('impact probe returns missing_table when Parts absent', async () => {
    const result = await probeImpactSelftest({
      env: {
        A_SEARCH_ENV: 'live',
        MSSQL_SERVER: 'sql.test',
        MSSQL_DATABASE: 'madeiradb',
        MSSQL_USER: 'u',
        MSSQL_PASSWORD: 'p',
      },
      connect: async () => ({
        request() {
          return {
            async query() {
              throw new Error("Invalid object name 'dbo.Parts'.");
            },
          };
        },
        async close() {},
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'missing_table');
  });
});

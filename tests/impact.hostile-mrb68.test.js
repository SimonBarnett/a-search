'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const impact = path.join(__dirname, '..', 'providers', 'local', 'impact');

describe('MRB #68 hostile: FR-021 impact local scaffold', () => {
  it('paths exist; skill pins MSSQL Parts; run(msg) callable with mock', async () => {
    assert.ok(fs.existsSync(path.join(impact, 'AGENTS.md')));
    const skill = path.join(impact, '.grok', 'skills', 'a-search-impact', 'SKILL.md');
    assert.ok(fs.existsSync(skill));
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /MSSQL|Parts/i);
    assert.match(text, /maintainer/i);
    const { run } = require('../providers/local/impact/src/worker');
    const out = await run(
      {
        searchId: 'srch_h68',
        userId: 'U1',
        env: 'sandbox',
        source: 'impact',
        q: 'x',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          S3_RESULTS_BUCKET: 'b',
        },
        queryParts: async () => [],
        putObject: async () => ({}),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.source, 'impact');
    assert.ok(Array.isArray(out.products));
  });

  it('.env.example keeps MSSQL secrets in provider env only', () => {
    const text = fs.readFileSync(path.join(impact, '.env.example'), 'utf8');
    assert.match(text, /MSSQL_/);
    assert.match(text, /A_SEARCH_ENV/);
    assert.match(text, /SQS_IMPACT_URL/);
    const entryEnv = fs.readFileSync(
      path.join(__dirname, '..', 'entry', '.env.example'),
      'utf8',
    );
    assert.doesNotMatch(entryEnv, /MSSQL_PASSWORD/);
  });

  it('default queryParts without MSSQL config fails clearly (FR-044)', async () => {
    const { run, ImpactMssqlConfigError } = require(
      '../providers/local/impact/src/worker',
    );
    await assert.rejects(
      () =>
        run(
          {
            searchId: 'srch_h',
            userId: 'U',
            env: 'live',
            source: 'impact',
            q: 'x',
            catalogId: 1,
          },
          {
            env: {
              A_SEARCH_ENV: 'live',
              S3_RESULTS_BUCKET: 'b',
            },
            putObject: async () => {
              throw new Error('should not put');
            },
          },
        ),
      (err) =>
        err instanceof ImpactMssqlConfigError ||
        err.name === 'ImpactMssqlConfigError',
    );
  });
});

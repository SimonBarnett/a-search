'use strict';

/**
 * Hostile MRB #4952 / FR #4947: behavioural pin that importParts begins a run,
 * stamps LastSeenRunId in MERGE SQL, records ImportRunFeeds, and skips all of
 * that on dryRun. Failures finish the run as failed.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  importParts,
  beginImportRun,
  finishImportRun,
} = require('../tools/dbimport/sql.js');

function mockPool(handlers) {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = {};
      const req = {
        input(name, _type, value) {
          inputs[name] = value;
          return req;
        },
        async query(sqlText) {
          calls.push({ sql: String(sqlText), inputs: { ...inputs } });
          if (typeof handlers.query === 'function') {
            return handlers.query(sqlText, inputs, calls);
          }
          return { recordset: [{ c: 0, RunId: 77, MergeRows: 1, DeletedRows: 0 }] };
        },
        async bulk() {
          calls.push({ bulk: true, inputs: { ...inputs } });
          return {};
        },
      };
      return req;
    },
  };
}

describe('MRB #4952 hostile dbimport ImportRuns', () => {
  it('dryRun never inserts ImportRuns', async () => {
    const pool = mockPool({
      query(sqlText) {
        if (/COUNT\(\*\)/.test(sqlText)) return { recordset: [{ c: 0 }] };
        return { recordset: [] };
      },
    });
    const out = await importParts(pool, {
      source: 'awin',
      feedKey: '116097',
      env: 'live',
      rows: [{ MerchantProductId: 'p1', Title: 't', Url: 'https://example.test/p' }],
      dryRun: true,
      maxRemoveRatio: 0.5,
    });
    assert.equal(out.dryRun, true);
    assert.equal(
      pool.calls.filter((c) => /INSERT INTO ingest\.ImportRuns/i.test(c.sql || '')).length,
      0,
    );
  });

  it('live import inserts run, stamps LastSeenRunId, finishes ok', async () => {
    const pool = mockPool({
      query(sqlText, inputs) {
        if (/COUNT\(\*\)/.test(sqlText)) return { recordset: [{ c: 0 }] };
        if (/INSERT INTO ingest\.ImportRuns/i.test(sqlText)) {
          return { recordset: [{ RunId: 42 }] };
        }
        if (/MERGE dbo\.Parts/i.test(sqlText)) {
          assert.equal(inputs.RunId, 42);
          assert.match(sqlText, /LastSeenRunId=@RunId/);
          return { recordset: [{ MergeRows: 1 }] };
        }
        if (/UPDATE dbo\.Parts/i.test(sqlText) && /DeletedAt/i.test(sqlText)) {
          return { recordset: [{ DeletedRows: 0 }] };
        }
        return { recordset: [] };
      },
    });
    const out = await importParts(pool, {
      source: 'awin',
      feedKey: '116097',
      env: 'live',
      rows: [{ MerchantProductId: 'p1', Title: 't', Url: 'https://example.test/p' }],
      dryRun: false,
      host: 'walrus',
      fileKey: 'awin/116097/2026-10-25.csv',
      maxRemoveRatio: 0.5,
    });
    assert.equal(out.runId, 42);
    assert.ok(
      pool.calls.some((c) => /INSERT INTO ingest\.ImportRuns/i.test(c.sql || '')),
    );
    assert.ok(
      pool.calls.some((c) => /INSERT INTO ingest\.ImportRunFeeds/i.test(c.sql || '')),
    );
    assert.ok(
      pool.calls.some(
        (c) =>
          /UPDATE ingest\.ImportRuns/i.test(c.sql || '') &&
          c.inputs.Status === 'ok',
      ),
    );
    assert.ok(
      pool.calls.some(
        (c) => /MERGE dbo\.Parts/i.test(c.sql || '') && /LastSeenRunId=@RunId/.test(c.sql),
      ),
    );
  });

  it('merge failure finishes ImportRuns as failed', async () => {
    const pool = mockPool({
      query(sqlText) {
        if (/COUNT\(\*\)/.test(sqlText)) return { recordset: [{ c: 0 }] };
        if (/INSERT INTO ingest\.ImportRuns/i.test(sqlText)) {
          return { recordset: [{ RunId: 9 }] };
        }
        if (/MERGE dbo\.Parts/i.test(sqlText)) {
          const err = new Error('merge boom');
          err.code = 'sql_error';
          throw err;
        }
        return { recordset: [] };
      },
    });
    await assert.rejects(
      () =>
        importParts(pool, {
          source: 'awin',
          feedKey: 'x',
          env: 'live',
          rows: [{ MerchantProductId: 'p1', Title: 't', Url: 'https://example.test/p' }],
          dryRun: false,
          maxRemoveRatio: 0.5,
        }),
      /merge boom/,
    );
    assert.ok(
      pool.calls.some(
        (c) =>
          /UPDATE ingest\.ImportRuns/i.test(c.sql || '') &&
          c.inputs.Status === 'failed',
      ),
    );
    assert.ok(
      pool.calls.some(
        (c) =>
          /INSERT INTO ingest\.ImportRunFeeds/i.test(c.sql || '') &&
          c.inputs.Status === 'failed',
      ),
    );
  });

  it('DbImportSql.ps1 WhatIf/dry path precedes ImportRuns insert', () => {
    const fs = require('node:fs');
    const ps = fs.readFileSync(
      path.join(__dirname, '..', 'tools', 'DbImportSql.ps1'),
      'utf8',
    );
    const dryIdx = ps.search(/dryRun\s*=\s*\$true/);
    const insertIdx = ps.search(/INSERT INTO ingest\.ImportRuns/);
    assert.ok(dryIdx >= 0 && insertIdx > dryIdx);
    assert.match(ps, /LastSeenRunId=@RunId/);
  });
});

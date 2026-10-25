'use strict';

/**
 * FR #4942: DeleteMissing must not wipe Parts with NULL LastSeenRunId.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSqlStore } = require('../walrus/import/src/sqlStore');
const { createMemoryStore } = require('../walrus/import/src/memoryStore');

const ROOT = path.join(__dirname, '..');

describe('FR #4942 null LastSeenRunId skip-delete', () => {
  it('sqlStore soft-delete SQL requires LastSeenRunId IS NOT NULL', async () => {
    const seen = [];
    const store = createSqlStore({
      env: 'live',
      database: 'a_search',
      envVars: {
        MSSQL_SERVER: 'walrus',
        MSSQL_DATABASE: 'a_search',
        MSSQL_USER: 'u',
        MSSQL_PASSWORD: 'p',
      },
      exec: async (sqlText) => {
        seen.push(String(sqlText));
        if (String(sqlText).includes('SELECT') && String(sqlText).includes('FROM dbo.Parts')) {
          return {
            recordset: [
              {
                Source: 'awin',
                FeedKey: 'f1',
                MerchantProductId: 'old',
                Env: 'live',
                DeletedAt: null,
                LastSeenRunId: null,
              },
            ],
          };
        }
        return { recordset: [{ Deleted: 0 }] };
      },
    });
    const out = await store.mergeFeed({
      runId: 9,
      providerId: 'awin',
      feedKey: 'f1',
      className: 'affiliate',
      staged: [],
      deleteMissing: 'soft',
    });
    assert.equal(out.deleted, 0);
    const delSql = seen.find((s) => s.includes('DeletedAt') && s.includes('UPDATE T'));
    assert.ok(delSql);
    assert.match(delSql, /LastSeenRunId\s+IS\s+NOT\s+NULL/);
  });

  it('memoryStore keeps null-LastSeen orphans when deleteMissing=soft', async () => {
    const store = createMemoryStore({ env: 'live' });
    store.seedPart({
      Source: 'awin',
      FeedKey: 'f1',
      MerchantProductId: 'orphan',
      LastSeenRunId: null,
    });
    const out = await store.mergeFeed({
      runId: 2,
      providerId: 'awin',
      feedKey: 'f1',
      className: 'affiliate',
      staged: [
        {
          MerchantProductId: 'keep',
          title: 'A',
          ContentHash: 'h1',
        },
      ],
      deleteMissing: 'soft',
    });
    const after = store.listActive('awin', 'f1');
    assert.ok(after.some((r) => r.MerchantProductId === 'orphan' && !r.DeletedAt));
    assert.ok(after.some((r) => r.MerchantProductId === 'keep'));
    assert.equal(out.deleted, 0);
  });

  it('023 DeleteMissingParts requires LastSeenRunId IS NOT NULL', () => {
    const sql023 = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '023_DeleteMissingParts_null_lastseen.sql'),
      'utf8',
    );
    assert.match(sql023, /LastSeenRunId\s+IS\s+NOT\s+NULL/);
    assert.match(sql023, /CREATE\s+OR\s+ALTER\s+PROCEDURE\s+dbo\.DeleteMissingParts/i);
  });
});

'use strict';

/** FR-051a: Impact pending-onboard queue docs + DDL note */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'impact-pending-onboard-queue.md');
const sql = path.join(root, 'docs', 'sql', '001_ImpactPendingOnboard.sql');

describe('FR-051a impact pending-onboard queue docs', () => {
  it('docs/impact-pending-onboard-queue.md exists', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/impact-pending-onboard-queue.md');
  });

  it('documents env keys and UNKNOWN API rationale', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /UNKNOWN/i);
    assert.match(text, /MSSQL_SERVER/);
    assert.match(text, /MSSQL_DATABASE/);
    assert.match(text, /A_SEARCH_ENV/);
    assert.match(text, /IMPACT_PENDING_ONBOARD_TABLE|ImpactPendingOnboard/);
    assert.match(text, /pending/i);
  });

  it('DDL note script exists with migrate-once ImpactPendingOnboard', () => {
    assert.ok(fs.existsSync(sql), 'missing docs/sql/001_ImpactPendingOnboard.sql');
    const text = fs.readFileSync(sql, 'utf8');
    assert.match(text, /IF OBJECT_ID/i);
    assert.match(text, /ImpactPendingOnboard/);
    assert.match(text, /\bEnv\b/);
    assert.match(text, /\bMerchantId\b/);
    assert.match(text, /\bStatus\b/);
    assert.match(text, /pending/);
  });

  it('root README links the pending-queue doc', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/impact-pending-onboard-queue\.md/);
  });
});

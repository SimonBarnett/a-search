'use strict';

/**
 * MRB #905 hostile pins for FR-117 orphan-safe reads.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dataModel = path.join(root, 'docs', 'data-model.md');
const report = path.join(root, 'scripts', 'orphan-report.sql');
const helper = path.join(root, 'shared', 'mssql', 'orphanSafe.js');

describe('MRB-905 FR-117 hostile', () => {
  it('data-model keep-both: inventory + Club scans + Integrity (single each)', () => {
    const text = fs.readFileSync(dataModel, 'utf8');
    assert.equal((text.match(/## dbo table inventory/g) || []).length, 1);
    assert.equal((text.match(/## Club scans/g) || []).length, 1);
    assert.equal((text.match(/## Integrity/g) || []).length, 1);
    assert.match(text, /```mermaid/);
    assert.match(text, /enforced FK|UserApiKeys\.user_id/i);
    assert.match(text, /logical only/i);
    assert.match(text, /fail closed/i);
    assert.match(text, /orphanSafe\.js/);
    assert.match(text, /orphan-report\.sql/);
    assert.match(text, /4OETP8TP/);
    assert.match(text, /dbo\.clubscan/);
    assert.match(text, /madeira-awin-clubscan/);
    assert.equal(text.includes('`WIN-'), false);
    assert.ok(!text.includes('<<<<<<<') && !text.includes('>>>>>>>'));
  });

  it('orphan-report.sql is SELECT-only (no DML/DDL tokens)', () => {
    const text = fs.readFileSync(report, 'utf8');
    assert.match(text, /NOT EXISTS/i);
    assert.match(text, /dbo\.Users/i);
    assert.match(text, /CONVERT\s*\(\s*varchar\s*\(\s*8\s*\)/i);
    for (const bad of ['INSERT', 'UPDATE', 'DELETE', 'ALTER', 'DROP', 'MERGE']) {
      assert.doesNotMatch(
        text,
        new RegExp('\\b' + bad + '\\b', 'i'),
        'must not contain ' + bad,
      );
    }
  });

  it('orphanSafe helper exports gate + empty-on-orphan contract', () => {
    const {
      normalizeUserCode,
      resolveTenantUser,
      readForTenantUser,
      USERS_EXISTS_SQL,
    } = require('../shared/mssql/orphanSafe');
    assert.equal(typeof normalizeUserCode, 'function');
    assert.equal(typeof resolveTenantUser, 'function');
    assert.equal(typeof readForTenantUser, 'function');
    assert.match(String(USERS_EXISTS_SQL || ''), /Users/i);
    const src = fs.readFileSync(helper, 'utf8');
    assert.match(src, /missing_user/);
    assert.match(src, /empty/i);
  });

  it('README links data-model with FR-117 Integrity blurb; prior schema docs hold', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
    assert.match(readme, /FR-117|Integrity|orphan/i);
    assert.match(readme, /docs\/identity\.md/);
    assert.match(readme, /docs\/catalog-model\.md/);
    assert.ok(!readme.includes('<<<<<<<'));
  });
});

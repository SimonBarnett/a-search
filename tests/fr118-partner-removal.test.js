'use strict';

/** FR-118: partner removal cascade docs + SELECT-only impact SQL + S3 dry-run script */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const docPath = path.join(root, 'docs', 'partner-removal.md');
const sqlPath = path.join(root, 'scripts', 'partner-removal-impact.sql');
const ps1Path = path.join(root, 'scripts', 'Remove-ASearchUserArtifacts.ps1');

const REQUIRED_TABLES = [
  'Products',
  'RejectedAsins',
  'Catalog',
  'CatalogAffiliateUpdates',
  'MerchantProducts',
  'UserCategories',
  'UserApiKeys',
  'UserFingerprints',
  'SystemOTPs',
  'MerchantCatalog',
  'DatabaseCallLog',
  'PostHogEvents',
  'FingerprintCatalogAccess',
  'clubscan',
  'Users',
  'Partner',
  'AwinHighApprovalMerchants',
  'AwinTransactions',
  'Commissions',
  'Payments',
];

describe('FR-118 docs/partner-removal.md', () => {
  it('lists every required table with an action', () => {
    assert.ok(fs.existsSync(docPath), 'missing docs/partner-removal.md');
    const text = fs.readFileSync(docPath, 'utf8');
    for (const t of REQUIRED_TABLES) {
      assert.match(text, new RegExp('\\b' + t + '\\b'), 'missing table ' + t);
    }
    assert.match(text, /\*\*delete\*\*/i);
    assert.match(text, /\*\*reassign\*\*/i);
    assert.match(text, /\*\*backup only\*\*/i);
    assert.match(text, /\*\*out of scope\*\*/i);
    assert.match(text, /DBA/i);
    assert.match(text, /a-search runtime feature/i);
  });

  it('covers a-search S3 + JWT + reassign keep userId', () => {
    const text = fs.readFileSync(docPath, 'utf8');
    assert.match(text, /_mapping/);
    assert.match(text, /_reports/);
    assert.match(text, /\{env\}\/\{source\}\/\{userId\}/);
    assert.match(text, /JWT/i);
    assert.match(text, /FR-117/);
    assert.match(text, /re-key nothing|userId is unchanged|keep the same `userId`/i);
    assert.match(text, /DryRun|dry-run/i);
    assert.match(text, /Remove-ASearchUserArtifacts\.ps1/);
  });

  it('README links partner-removal.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/partner-removal\.md/);
  });
});

describe('FR-118 scripts/partner-removal-impact.sql', () => {
  it('is SELECT-only (no DML/DDL)', () => {
    assert.ok(fs.existsSync(sqlPath), 'missing scripts/partner-removal-impact.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.match(sql, /SELECT/i);
    assert.match(sql, /@Code/);
    assert.match(sql, /COUNT_BIG/i);
    assert.match(sql, /dbo\.Products/i);
    assert.match(sql, /dbo\.clubscan/i);
    assert.match(sql, /dbo\.Users/i);
    assert.match(sql, /dbo\.Partner/i);
    assert.match(sql, /MerchantCatalog/i);
    assert.doesNotMatch(sql, /\bINSERT\b/i);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /\bDELETE\b/i);
    assert.doesNotMatch(sql, /\bALTER\b/i);
    assert.doesNotMatch(sql, /\bDROP\b/i);
    assert.doesNotMatch(sql, /\bMERGE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  });
});

describe('FR-118 scripts/Remove-ASearchUserArtifacts.ps1', () => {
  it('defaults to dry-run and requires ConfirmDelete to remove', () => {
    assert.ok(fs.existsSync(ps1Path), 'missing Remove-ASearchUserArtifacts.ps1');
    const ps1 = fs.readFileSync(ps1Path, 'utf8');
    assert.match(ps1, /\[switch\]\s*\$DryRun/);
    assert.match(ps1, /\[switch\]\s*\$ConfirmDelete/);
    assert.match(ps1, /\$doDelete\s*=\s*\[bool\]\$ConfirmDelete/);
    assert.match(ps1, /if \(-not \$doDelete\) \{ \$DryRun = \$true \}/);
    assert.match(ps1, /_mapping/);
    assert.match(ps1, /_reports/);
    assert.match(ps1, /list-objects-v2|ListObjectsV2/i);
    assert.match(ps1, /delete-object/i);
    assert.match(ps1, /DryRun complete/);
  });
});

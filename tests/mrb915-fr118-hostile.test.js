'use strict';

/**
 * MRB #915 hostile pins for FR-118 partner removal cascade.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'partner-removal.md');
const sql = path.join(root, 'scripts', 'partner-removal-impact.sql');
const ps1 = path.join(root, 'scripts', 'Remove-ASearchUserArtifacts.ps1');

describe('MRB-915 FR-118 hostile', () => {
  it('partner-removal.md: DBA-only DB deletes; table actions; Greenfield codes', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /DBA/i);
    assert.match(text, /a-search runtime feature/i);
    assert.match(text, /MWRJCP92/);
    assert.match(text, /MV69J0VA/);
    assert.match(text, /L7WDZWC8/);
    assert.match(text, /\*\*delete\*\*/i);
    assert.match(text, /\*\*reassign\*\*/i);
    assert.match(text, /\*\*out of scope\*\*/i);
    assert.match(text, /AwinHighApprovalMerchants/);
    assert.match(text, /FR-117/);
    assert.match(text, /Remove-ASearchUserArtifacts\.ps1/);
    assert.match(text, /dry-run|DryRun/i);
    assert.equal([...text].filter((c) => c.charCodeAt(0) > 127).length, 0);
  });

  it('impact SQL SELECT-only with @Code counts', () => {
    const text = fs.readFileSync(sql, 'utf8');
    assert.match(text, /@Code/);
    assert.match(text, /COUNT_BIG/i);
    assert.match(text, /dbo\.Products/i);
    assert.match(text, /dbo\.clubscan/i);
    assert.match(text, /MerchantCatalog/i);
    for (const bad of ['INSERT', 'UPDATE', 'DELETE', 'ALTER', 'DROP', 'MERGE', 'TRUNCATE']) {
      assert.doesNotMatch(text, new RegExp('\\b' + bad + '\\b', 'i'), bad);
    }
  });

  it('Remove-ASearchUserArtifacts.ps1 dry-run default; ConfirmDelete gates delete-object', () => {
    const text = fs.readFileSync(ps1, 'utf8');
    assert.match(text, /\[switch\]\s*\$ConfirmDelete/);
    assert.match(text, /if \(-not \$doDelete\) \{ \$DryRun = \$true \}/);
    assert.match(text, /delete-object/i);
    assert.match(text, /_mapping/);
    assert.match(text, /_reports/);
  });

  it('README keep-both: partner-removal + schema docs links', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/partner-removal\.md/);
    assert.match(readme, /docs\/data-model\.md/);
    assert.match(readme, /docs\/identity\.md/);
    assert.match(readme, /docs\/catalog-model\.md/);
    assert.ok(!readme.includes('<<<<<<<'));
  });
});

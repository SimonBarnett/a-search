'use strict';

/**
 * MRB #900 hostile pins for FR-116 clubscan Lambda vs dbo.clubscan.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dataModel = path.join(root, 'docs', 'data-model.md');
const daily = path.join(root, 'docs', 'daily-report-signups.md');
const onboard = path.join(root, 'docs', 'onboarding-agents.md');

describe('MRB-900 FR-116 hostile', () => {
  it('data-model keep-both: inventory/ERD + Club scans section', () => {
    const text = fs.readFileSync(dataModel, 'utf8');
    assert.match(text, /## dbo table inventory/i);
    assert.match(text, /```mermaid/);
    assert.match(text, /## Club scans/i);
    assert.match(text, /dbo\.clubscan/);
    assert.match(text, /fn_ClubScanIsActive|active/i);
    assert.match(text, /clubs\(\)/);
    assert.match(text, /JsonResult/);
    assert.match(text, /madeira-awin-clubscan/);
    assert.match(text, /AwinHighApprovalMerchants/);
    assert.match(text, /2889699/);
  });

  it('disambiguation in daily-report + onboarding', () => {
    for (const [name, p] of [
      ['daily-report-signups.md', daily],
      ['onboarding-agents.md', onboard],
    ]) {
      const text = fs.readFileSync(p, 'utf8');
      assert.match(text, /dbo\.clubscan/, name);
      assert.match(
        text,
        /madeira-awin-clubscan/,
        name + ' names Lambda',
      );
      assert.match(
        text,
        /!=|not the same|disambiguat|not writes to/i,
        name + ' separates Lambda vs table',
      );
    }
  });

  it('daily-report map has AwinHighApprovalMerchants + do-not-copy 2889699', () => {
    const text = fs.readFileSync(daily, 'utf8');
    assert.match(text, /AwinHighApprovalMerchants/);
    assert.match(text, /MerchantId/);
    assert.match(text, /2889699/);
    assert.match(text, /inferred|never copy|do not copy|must not copy/i);
  });

  it('README links data-model; fr113 pins still hold', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
    assert.match(readme, /docs\/identity\.md/);
    assert.match(readme, /docs\/catalog-model\.md/);
    const text = fs.readFileSync(dataModel, 'utf8');
    for (const name of [
      'Users',
      'MerchantProducts',
      'Products',
      'Catalog',
      'RejectedAsins',
      'clubscan',
    ]) {
      assert.match(text, new RegExp('\\b' + name + '\\b'));
    }
  });
});

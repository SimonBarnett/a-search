'use strict';

/** FR-116: dbo.clubscan vs madeira-awin-clubscan disambiguation pins */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dataModel = path.join(root, 'docs', 'data-model.md');
const daily = path.join(root, 'docs', 'daily-report-signups.md');
const onboard = path.join(root, 'docs', 'onboarding-agents.md');

describe('FR-116 dbo.clubscan docs', () => {
  it('data-model.md has Club scans section with dbo.clubscan', () => {
    assert.ok(fs.existsSync(dataModel), 'missing docs/data-model.md');
    const text = fs.readFileSync(dataModel, 'utf8');
    assert.match(text, /## Club scans/i);
    assert.match(text, /dbo\.clubscan/);
    assert.match(text, /fn_ClubScanIsActive|active bit/i);
    assert.match(text, /clubs\(\)/);
    assert.match(text, /JsonResult|\$\.name/);
    assert.match(text, /PartnerId|ClubID/);
  });

  it('daily-report-signups.md and onboarding-agents.md disambiguate', () => {
    const d = fs.readFileSync(daily, 'utf8');
    const o = fs.readFileSync(onboard, 'utf8');
    for (const [name, text] of [
      ['daily-report-signups.md', d],
      ['onboarding-agents.md', o],
    ]) {
      assert.match(text, /dbo\.clubscan/, name + ' mentions dbo.clubscan');
      assert.match(
        text,
        /madeira-awin-clubscan.*dbo\.clubscan|dbo\.clubscan.*madeira-awin-clubscan|≠|!=|not the same|disambiguat/i,
        name + ' disambiguates Lambda vs table',
      );
    }
  });

  it('daily-report field map includes AwinHighApprovalMerchants columns', () => {
    const text = fs.readFileSync(daily, 'utf8');
    assert.match(text, /AwinHighApprovalMerchants/);
    assert.match(text, /MerchantId/);
    assert.match(text, /2889699/);
    assert.match(text, /inferred/i);
    // each signup field row should mention AwinHighApproval or none
    assert.match(text, /AwinHighApprovalMerchants.*\|.*none|\| none \|/i);
  });

  it('README links data-model.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
  });
});

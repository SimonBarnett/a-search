'use strict';

/** FR-052a: docs/daily-report-signups.md clubscan field map */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'daily-report-signups.md');

const CLUBSCAN_TREE =
  'https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan';

describe('FR-052a docs/daily-report-signups.md', () => {
  it('doc exists', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/daily-report-signups.md');
  });

  it('links clubscan repo path', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.ok(
      text.includes(CLUBSCAN_TREE),
      'must link madeira-awin-clubscan tree URL',
    );
    assert.match(text, /clubscan/i);
  });

  it('has field table mapping clubscan to a-search signup fields', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /\|.*Clubscan.*\|.*a-search/i);
    assert.match(text, /company_name/);
    assert.match(text, /email/);
    assert.match(text, /advertiserId|merchantId/);
    assert.match(text, /user_id/);
    assert.match(text, /New merchants|new merchants/i);
    assert.match(text, /Last 24h|last 24h|sales/i);
    assert.match(text, /[Tt]otals/);
  });

  it('root README links the doc', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/daily-report-signups\.md/);
  });
});

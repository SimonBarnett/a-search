'use strict';

/** FR-052d: README links madeira-awin-clubscan daily report */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const CLUBSCAN_TREE =
  'https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan';

describe('FR-052d README clubscan daily report link', () => {
  it('README docs index links madeira-awin-clubscan tree', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.ok(
      readme.includes(CLUBSCAN_TREE),
      'README must link clubscan tree URL for daily report legacy',
    );
    assert.match(readme, /clubscan|madeira-awin-clubscan/i);
  });
});

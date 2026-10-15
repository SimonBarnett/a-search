'use strict';

/**
 * MRB #1892 docs/hostile: FR-220 clubmadeira.uk widget copy page pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #1892 hostile FR-220 clubmadeira widget copy', () => {
  it('Decision LOCKED + clubmadeira createdVia + Club TXT', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-220.md'));
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /clubmadeira\.uk/i);
    assert.match(text, /createdVia["']?\s*:\s*["']clubmadeira["']/i);
    assert.match(text, /Club TXT/i);
  });

  it('shared entrypoints pin both smartcatalogue and clubmadeira paths', () => {
    const {
      COPY_PAGE_ENTRYPOINTS,
    } = require('../shared/widgets/copyPageEntrypoints');
    const sites = COPY_PAGE_ENTRYPOINTS.map((e) => e.site).sort();
    assert.deepEqual(sites, ['clubmadeira.uk', 'smartcatalogue.uk'].sort());
    const club = COPY_PAGE_ENTRYPOINTS.find((e) => e.site === 'clubmadeira.uk');
    assert.equal(club.createdVia, 'clubmadeira');
    assert.equal(
      club.repoPath,
      'components-piece/widget-copy-clubmadeira/index.html',
    );
    assert.ok(
      fs.existsSync(path.join(ROOT, club.repoPath)),
      'club copy html missing',
    );
  });

  it('entry wires POST /widgets mint and keeps FR-216 merchant shops', () => {
    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /matchWidgetsCreateRoute/);
    assert.match(index, /handleWidgetsCreate/);
    assert.match(index, /matchMerchantShopsRoute/);
    assert.match(index, /handleMerchantShopsConnect/);
    assert.doesNotMatch(index, /^<<<<<<<|^>>>>>>>|^=======/m);
  });
});

'use strict';

/**
 * FR #4961: walrus import schema_drift on awin/1902 when the on-disk
 * .csv is still gzip (1f8b) even though the marker/name say plain csv.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { parseAndMapFeed } = require('../walrus/import/src/parseMapped');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'import');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('FR #4961 awin gzip leftover vs schema_drift', () => {
  it('gzip bytes of awin-sample.csv do not throw schema_drift', () => {
    const cfg = loadJson(path.join(ROOT, 'providers', 'local', 'awin', 'provider.json'));
    const plain = fs.readFileSync(path.join(FIX, 'awin-sample.csv'));
    const gz = zlib.gzipSync(plain);
    assert.equal(gz[0], 0x1f);
    assert.equal(gz[1], 0x8b);
    const out = parseAndMapFeed(gz, cfg, { feedKey: '1902' });
    assert.equal(out.staged.length, 2);
    assert.equal(out.staged[0].sku, 'P1');
  });

  it('plain awin-sample.csv still maps', () => {
    const cfg = loadJson(path.join(ROOT, 'providers', 'local', 'awin', 'provider.json'));
    const out = parseAndMapFeed(fs.readFileSync(path.join(FIX, 'awin-sample.csv')), cfg, {
      feedKey: '1902',
    });
    assert.equal(out.staged.length, 2);
  });
});

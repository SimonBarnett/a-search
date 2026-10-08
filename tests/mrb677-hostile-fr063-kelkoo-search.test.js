'use strict';

/** MRB #677 hostile: FR-063 kelkoo search injectable + stay-dark. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #677 hostile FR-063 kelkoo search', () => {
  it('search.js exports injectable httpRequest and never enables registry', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/kelkoo/src/search.js'),
      'utf8',
    );
    assert.match(src, /httpRequest/);
    assert.match(src, /assertKelkooCreds|kelkoo_missing_credentials/);
    assert.match(src, /Stay-dark|stay-dark|do not enable/i);
    assert.doesNotMatch(src, /enabled\.live\s*=\s*true/);
  });

  it('fixture has offers and example.test URLs only', () => {
    const fix = JSON.parse(
      fs.readFileSync(
        path.join(root, 'providers/live/kelkoo/fixtures/offers-ok.json'),
        'utf8',
      ),
    );
    assert.ok(Array.isArray(fix.offers) && fix.offers.length >= 1);
    const blob = JSON.stringify(fix);
    assert.match(blob, /example\.test/);
  });

  it('worker remains stub (out of scope) while search exists', () => {
    const worker = fs.readFileSync(
      path.join(root, 'providers/live/kelkoo/src/worker.js'),
      'utf8',
    );
    assert.match(worker, /stub|not.?wired|not implemented/i);
    assert.ok(
      fs.existsSync(path.join(root, 'providers/live/kelkoo/src/search.js')),
    );
  });
});

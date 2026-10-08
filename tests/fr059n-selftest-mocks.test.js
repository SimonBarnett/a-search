'use strict';

/** FR-059n: docs/mocks selftest.html empty and error exist */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mocks = path.join(root, 'docs', 'mocks');

describe('FR-059n selftest mock HTML', () => {
  it('key / empty / error mock files exist', () => {
    for (const name of [
      'selftest.html',
      'selftest-empty.html',
      'selftest-error.html',
    ]) {
      const p = path.join(mocks, name);
      assert.ok(fs.existsSync(p), `missing docs/mocks/${name}`);
      const text = fs.readFileSync(p, 'utf8');
      assert.match(text, /<!DOCTYPE html>/i);
      assert.match(text, /selftest/i);
    }
  });

  it('key mock shows providers; empty has []; error has 401', () => {
    const key = fs.readFileSync(path.join(mocks, 'selftest.html'), 'utf8');
    assert.match(key, /providers/i);
    assert.match(key, /intakeFiled/i);
    assert.match(key, /userId/);
    assert.match(key, /ebay/i);

    const empty = fs.readFileSync(
      path.join(mocks, 'selftest-empty.html'),
      'utf8',
    );
    assert.match(empty, /"providers": \[\]/);
    assert.match(empty, /not 404/i);

    const err = fs.readFileSync(
      path.join(mocks, 'selftest-error.html'),
      'utf8',
    );
    assert.match(err, /401/);
    assert.match(err, /unauthorized|user_id_mismatch/i);
  });

  it('README links selftest mocks', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/mocks\/selftest\.html/);
  });
});

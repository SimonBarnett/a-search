'use strict';

/** FR-053g: docs/mocks performance.html empty and error exist */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mocks = path.join(root, 'docs', 'mocks');

describe('FR-053g performance mock HTML', () => {
  it('key / empty / error mock files exist', () => {
    for (const name of [
      'performance.html',
      'performance-empty.html',
      'performance-error.html',
    ]) {
      const p = path.join(mocks, name);
      assert.ok(fs.existsSync(p), `missing docs/mocks/${name}`);
      const text = fs.readFileSync(p, 'utf8');
      assert.match(text, /<!DOCTYPE html>/i);
      assert.match(text, /performance/i);
    }
  });

  it('key mock shows clicks visits sales; empty has zeros; error has 401', () => {
    const key = fs.readFileSync(path.join(mocks, 'performance.html'), 'utf8');
    assert.match(key, /clicks/i);
    assert.match(key, /visits/i);
    assert.match(key, /sales/i);
    assert.match(key, /userId/);

    const empty = fs.readFileSync(
      path.join(mocks, 'performance-empty.html'),
      'utf8',
    );
    assert.match(empty, /"clicks": 0/);
    assert.match(empty, /not 404/i);

    const err = fs.readFileSync(
      path.join(mocks, 'performance-error.html'),
      'utf8',
    );
    assert.match(err, /401/);
    assert.match(err, /unauthorized|user_id_mismatch/i);
  });

  it('README links performance mocks', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/mocks\/performance\.html/);
  });
});

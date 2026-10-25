'use strict';

/**
 * Hostile MRB #4907 / FR #4898: Stay-dark pin works on CRLF checkouts.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function stayDarkSlice(raw) {
  const matrix = String(raw).replace(/\r\n/g, '\n');
  return matrix.match(/Stay-dark omitted[\s\S]*?(?=\n## |\nPublic)/);
}

describe('MRB #4907 hostile FR #4898 Stay-dark CRLF', () => {
  it('CRLF checkout still captures Stay-dark and omits woo/wix', () => {
    const lf = fs.readFileSync(path.join(root, 'docs', 'secrets-matrix.md'), 'utf8');
    const crlf = lf.replace(/\n/g, '\r\n');
    const omit = stayDarkSlice(crlf);
    assert.ok(omit);
    assert.match(omit[0], /admitad/);
    assert.doesNotMatch(omit[0], /\bwoocommerce\b/);
    assert.doesNotMatch(omit[0], /\bwix\b/);
    const old = crlf.match(/Stay-dark omitted[\s\S]*?(?=\n\n|\nPublic)/);
    assert.equal(old, null);
  });

  it('pin source normalizes CRLF and bounds on ##', () => {
    const pin = fs.readFileSync(
      path.join(root, 'tests', 'mrb-hostile-fr180-enable-woocommerce.test.js'),
      'utf8',
    );
    assert.match(pin, /replace\(\/\\r\\n\/g,\s*'\\n'\)/);
    assert.match(pin, /Stay-dark omitted\[\\s\\S\]\*\?\(\?=\\n## \|\\nPublic\)/);
  });
});

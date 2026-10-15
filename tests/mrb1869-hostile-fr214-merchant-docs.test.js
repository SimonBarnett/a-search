'use strict';

/**
 * MRB #1869 docs/hostile: FR-214 merchant docs lock.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function asciiNoBom(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.notEqual(buf[0], 0xef, `${rel} BOM`);
  for (const b of buf) assert.ok(b < 128, `${rel} ASCII`);
  return buf.toString('utf8');
}

describe('MRB #1869 hostile FR-214 merchant docs lock', () => {
  it('merchant.md LOCKED taxonomy + Stripe products; FR-223 DROPPED', () => {
    const m = asciiNoBom('docs/components-piece-merchant.md');
    assert.match(m, /LOCKED/);
    assert.match(m, /AFFILIATE/);
    assert.match(m, /MERCHANT/);
    assert.match(m, /PROVIDER/);
    assert.match(m, /merchant_shop/);
    assert.match(m, /widget_upgrade/);
    assert.doesNotMatch(m, /partner_monthly/);
    assert.match(m, /PrestaShop.*dropped|dropped.*PrestaShop/i);
    assert.match(m, /SMS OTP/);
    assert.match(m, /GBP 20/);

    const fr223 = asciiNoBom('docs/fr/FR-223.md');
    assert.match(fr223, /DROPPED/);

    const fr214 = asciiNoBom('docs/fr/FR-214.md');
    assert.match(fr214, /components-piece-merchant\.md/);
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'fr214-merchant-docs.test.js')));
  });
});

'use strict';

/**
 * FR #5324: v0.1 DoD D7 matches the market-hold list (not all Phase-2 stubs).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'release-installable.md');

const HOLD_IDS = [
  'bol',
  'aliexpress',
  'avantlink',
  'flexoffers',
  'admitad',
];

const ENABLED_ON_PURPOSE = [
  'kelkoo',
  'skimlinks',
  'etsy',
  'partnerize',
  'webgains',
  'tradedoubler',
  'shopify',
  'wix',
  'woocommerce',
];

describe('FR #5324 release-installable D7 market-hold', () => {
  it('D7 fail-when names five holds; lists intentional enables; not all Phase-2 false', () => {
    const raw = fs.readFileSync(DOC);
    assert.notEqual(raw[0], 0xef, 'UTF-8 without BOM');
    const text = raw.toString('utf8');

    const d7Line = text
      .split(/\r?\n/)
      .find((l) => /^\|\s*D7\s*\|/i.test(l));
    assert.ok(d7Line, 'docs/release-installable.md must have a D7 table row');

    assert.doesNotMatch(
      d7Line,
      /Phase-2 stub ids remain\s*`?enabled\.live\/sandbox=false`?/i,
    );
    assert.doesNotMatch(
      d7Line,
      /every Phase-2.*(enabled\.live|enabled=false)/i,
    );

    for (const id of HOLD_IDS) {
      assert.match(
        d7Line,
        new RegExp(`\\b${id}\\b`, 'i'),
        `D7 must name hold id ${id}`,
      );
    }
    assert.match(
      d7Line,
      /Accidental enable of bol,\s*aliexpress,\s*avantlink,\s*flexoffers,\s*or admitad/i,
    );

    for (const id of ENABLED_ON_PURPOSE) {
      assert.match(
        d7Line,
        new RegExp(`\\b${id}\\b`, 'i'),
        `D7 must name intentional enable ${id}`,
      );
    }
  });
});

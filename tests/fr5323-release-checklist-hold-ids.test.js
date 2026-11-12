'use strict';

/**
 * FR #5323: release-checklist stay-dark box names hold ids (not all Phase-2).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHECKLIST = path.join(ROOT, 'docs', 'release-checklist.md');

const HOLD_IDS = [
  'bol',
  'aliexpress',
  'avantlink',
  'flexoffers',
  'admitad',
];

const MERCHANT_LATER = ['squarespace', 'magento', 'ecwid', 'bigcommerce'];

describe('FR #5323 release-checklist hold-dark ids', () => {
  it('names hold ids + later merchants; not all Phase-2; not amazon/wix stay-dark', () => {
    const raw = fs.readFileSync(CHECKLIST);
    assert.notEqual(raw[0], 0xef, 'UTF-8 without BOM');
    const text = raw.toString('utf8');

    assert.doesNotMatch(
      text,
      /Stay-dark Phase-2 providers remain\s*`?enabled=false`?/i,
    );
    assert.doesNotMatch(
      text,
      /all Phase-2 (providers|ids).*(enabled=false|stay.?dark)/i,
    );

    const holdLine = text
      .split(/\r?\n/)
      .find(
        (l) =>
          /hold/i.test(l) &&
          HOLD_IDS.every((id) => new RegExp(`\\b${id}\\b`, 'i').test(l)),
      );
    assert.ok(
      holdLine,
      'checklist must have a hold-dark line naming bol, aliexpress, avantlink, flexoffers, admitad',
    );

    for (const id of HOLD_IDS) {
      assert.match(holdLine, new RegExp(`\\b${id}\\b`, 'i'));
    }
    for (const id of MERCHANT_LATER) {
      assert.match(text, new RegExp(`\\b${id}\\b`, 'i'));
    }

    assert.doesNotMatch(holdLine, /\bamazon\b/i);
    assert.doesNotMatch(holdLine, /\bwix\b/i);
    // amazon/wix must not be listed as stay-dark / hold-dark anywhere in the file
    const darkish = text
      .split(/\r?\n/)
      .filter((l) => /stay-?dark|hold-?dark|enabled=false/i.test(l));
    for (const line of darkish) {
      assert.doesNotMatch(
        line,
        /\bamazon\b/i,
        'amazon must not appear on a stay-dark/hold line',
      );
      assert.doesNotMatch(
        line,
        /\bwix\b/i,
        'wix must not appear on a stay-dark/hold line',
      );
    }
  });
});

'use strict';

/**
 * FR-252 / #1657: GBP/UK market-hold docs lock (hostile MRB #1663).
 * Needles: GBP, hold, do not delete, hold ids.
 * Fail-when: hold id as next Phase-4 enable work without HOLD marker.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const HOLD_IDS = [
  'bol',
  'aliexpress',
  'avantlink',
  'flexoffers',
  'admitad',
];

const DOC_RELS = [
  path.join('docs', 'feature-request-gbp-market-hold-2026-10-14.md'),
  path.join('docs', 'provider-shortlist.md'),
  path.join('docs', 'phase4-enablement-index.md'),
  path.join('docs', 'fr', 'FR-252.md'),
];

function readUtf8(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.ok(
    !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${rel} must be UTF-8 without BOM`,
  );
  return buf.toString('utf8');
}

function assertAscii(text, label) {
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII`,
  );
}

describe('FR-252 GBP/UK market-hold docs', () => {
  it('parked FR + shortlist + phase4 carry GBP hold needles and hold ids', () => {
    for (const rel of DOC_RELS) {
      assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
      const text = readUtf8(rel);
      assertAscii(text, rel);
    }

    const pack = readUtf8(DOC_RELS[0]);
    assert.match(pack, /GBP/);
    assert.match(pack, /hold/i);
    assert.match(pack, /[Dd]o not delete/);
    assert.match(pack, /Decision\s*\(?\s*LOCKED\)?/i);
    for (const id of HOLD_IDS) {
      assert.match(pack, new RegExp(`\`${id}\`|\\b${id}\\b`));
    }

    const shortlist = readUtf8(DOC_RELS[1]);
    assert.match(shortlist, /Market hold\s*-\s*GBP\s*\/\s*UK/i);
    assert.match(shortlist, /GBP/);
    assert.match(shortlist, /[Dd]o not delete/);
    assert.match(shortlist, /[Ss]pend no more tokens|[Nn]o more tokens/);
    for (const id of HOLD_IDS) {
      assert.match(shortlist, new RegExp(`\`${id}\``));
    }

    const phase4 = readUtf8(DOC_RELS[2]);
    assert.match(phase4, /GBP\s*\/\s*UK market hold|market hold.*GBP/i);
    assert.match(phase4, /FR-252/);
    for (const id of HOLD_IDS) {
      assert.match(phase4, new RegExp(`\`${id}\``));
    }

    const fr = readUtf8(DOC_RELS[3]);
    assert.match(fr, /FR-252/);
    assert.match(fr, /GBP/);
    assert.match(fr, /hold/i);
  });

  it('fail-when: each hold id in phase4 stay-dark table carries HOLD marker', () => {
    const phase4 = readUtf8(DOC_RELS[2]);
    for (const id of HOLD_IDS) {
      // Row must mention the id and HOLD on the same table line (or adjacent hold note).
      const rowRe = new RegExp(
        `\\|\\s*\`${id}\`[^\\n]*HOLD`,
        'i',
      );
      assert.match(
        phase4,
        rowRe,
        `${id} listed in phase4 without HOLD marker on its row`,
      );
    }
  });

  it('fail-when: shortlist registry-candidate rows mark hold ids HOLD', () => {
    const shortlist = readUtf8(DOC_RELS[1]);
    for (const id of HOLD_IDS) {
      const rowRe = new RegExp(`\\|\\s*\`${id}\`[^\\n]*HOLD`, 'i');
      assert.match(
        shortlist,
        rowRe,
        `${id} shortlist row missing HOLD marker`,
      );
    }
  });
});

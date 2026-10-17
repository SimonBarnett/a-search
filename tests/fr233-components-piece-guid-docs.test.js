'use strict';

/**
 * FR-233 / #1347: docs lock widgetGuid tree, caps, agent dispatch, stats.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const amenDoc = path.join(
  root,
  'docs',
  'feature-request-components-piece-2026-10-09.md',
);
const fr233 = path.join(root, 'docs', 'fr', 'FR-233.md');
const phase5d = path.join(root, 'docs', 'fr', 'ISSUED-PHASE5D.tsv');
const skillLayout = path.join(root, 'docs', 'skillbook-layout.md');

const NEEDLES = [
  'widgetGuid',
  '{customerNumber}/{widgetGuid}/',
  'widget.json',
  'feedback.json',
  'live.json',
  'LIVE_PART_CAP_FREE',
  'SQS FIFO',
  'no tokens while idle',
  'SUPERSEDED 2026-10-10',
  'widget_host_mismatch',
  'stats.json',
  'POST /w/events',
  'GET /widgets/stats',
  'not an agent trigger',
];

describe('FR-233 ComponentsPiece guid docs lock', () => {
  it('amendment doc + FR-233 + phase5d + skillbook CWD carry needles (ASCII no BOM)', () => {
    for (const p of [amenDoc, fr233, phase5d, skillLayout]) {
      assert.ok(fs.existsSync(p), `missing ${path.relative(root, p)}`);
      const buf = fs.readFileSync(p);
      assert.notEqual(buf[0], 0xef, `BOM in ${path.relative(root, p)}`);
    }
    const text = [
      fs.readFileSync(amenDoc, 'utf8'),
      fs.readFileSync(fr233, 'utf8'),
      fs.readFileSync(skillLayout, 'utf8'),
    ].join('\n');
    for (const n of NEEDLES) {
      assert.ok(text.includes(n), `missing needle: ${n}`);
    }
    assert.match(text, /Amendment 2026-10-10/);
    assert.match(text, /LIVE_PART_CAP_FULL/);
    assert.match(text, /EventBridge/);
    assert.match(text, /\bAFFILIATE\b/);
    assert.match(text, /\bMERCHANT\b/);
    assert.match(text, /\bPROVIDER\b/);
    assert.match(text, /CP23/);
    assert.match(text, /CP32/);
    assert.match(fs.readFileSync(phase5d, 'utf8'), /FR-233\t#1347/);
    assert.match(
      fs.readFileSync(skillLayout, 'utf8'),
      /Customer-tree agent CWD \(ComponentsPiece\)/,
    );
  });

  it('fail-when: uri-slug is marked SUPERSEDED; no second upgraded serving file', () => {
    const text = fs.readFileSync(amenDoc, 'utf8');
    const slugIdx = text.indexOf('{uri-slug}/');
    assert.ok(slugIdx >= 0, 'history tree keeps {uri-slug}/ visible');
    const window = text.slice(Math.max(0, slugIdx - 400), slugIdx + 80);
    assert.match(window, /SUPERSEDED 2026-10-10/);
    assert.match(text, /no second serving file/);
    assert.doesNotMatch(text, /premium\.json|upgraded\.json/);
    assert.match(text, /Parts API always serves `live\.json`/);
  });
});

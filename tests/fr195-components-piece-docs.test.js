'use strict';

/**
 * FR-195 / #1183: docs lock for ComponentsPiece architecture + contracts.
 * Docs only -- no Lambda/CDK. widgetGuid tree (FR-232); a-search DB rule (FR-251).
 * FR-233 owns feature-request amendments / skillbook-layout; this FR owns
 * docs/components-piece.md and links to FR-233's doc.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DOC = path.join(root, 'docs', 'components-piece.md');
const FEATURE_REQ = path.join(
  root,
  'docs',
  'feature-request-components-piece-2026-10-09.md',
);
const README = path.join(root, 'README.md');

describe('FR-195 ComponentsPiece docs lock', () => {
  it('docs/components-piece.md exists ASCII-only with required headings', () => {
    assert.ok(fs.existsSync(DOC), 'missing docs/components-piece.md');
    const buf = fs.readFileSync(DOC);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      assert.ok(
        c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126),
        `non-ASCII at ${i}: U+${c.toString(16)}`,
      );
    }
    assert.match(text, /^#\s+ComponentsPiece/m);
    assert.match(text, /##\s+Storage layout/i);
    assert.match(text, /##\s+Contracts/i);
    assert.match(text, /##\s+Trust boundaries/i);
    assert.match(text, /##\s+Database ownership/i);
  });

  it('pins widgetGuid tree paths and forbids uri-slug as required layout', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /widgetGuid/);
    assert.match(text, /x:\/\{customerNumber\}\/\{widgetGuid\}\//);
    assert.match(text, /live\.json/);
    assert.match(text, /top10\.json/);
    assert.match(text, /site\.md/);
    assert.match(text, /context\.md/);
    assert.match(text, /searches\.json/);
    assert.match(text, /IN\//);
    // uri-slug must not be required needle for FR-195 (FR-232 replaces it)
    assert.doesNotMatch(
      text,
      /\{uri-slug\}/,
      'storage layout must not require {uri-slug}',
    );
  });

  it('pins Parts/Click/POST widgets contracts and field names', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /GET\s+\/parts\?host&widgetGuid&offset&n/);
    assert.match(text, /customerNumber/);
    assert.match(text, /widgetGuid/);
    assert.match(text, /layout/);
    assert.match(text, /parts\[\]/);
    assert.match(text, /nextOffset/);
    assert.match(text, /GET\s+\/go\?host&widgetGuid&part/);
    assert.match(text, /\{\s*url\s*\}/);
    assert.match(text, /POST\s+\/widgets/);
  });

  it('trust boundaries include affiliate-URL-in-widget rule and host bind', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(
      text,
      /Widget never embeds affiliate destination URLs|never embed affiliate/i,
    );
    assert.match(text, /\/go/);
    assert.match(text, /widget_host_mismatch/);
    assert.match(
      text,
      /widgetGuid is bound to one host|bound to one host/i,
    );
    assert.match(text, /403/);
  });

  it('database ownership: a-search DB write; madeiradb read-only (FR-251)', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /a_search/);
    assert.match(text, /a_search_sandbox/);
    assert.match(text, /madeiradb/i);
    assert.match(text, /read-?only/i);
    assert.match(text, /FR-251|#1365/);
  });

  it('links feature-request + FR-233 split; README lists components-piece.md', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(
      text,
      /feature-request-components-piece-2026-10-09\.md/,
    );
    assert.match(text, /FR-233|#1347/);
    assert.ok(fs.existsSync(FEATURE_REQ), 'feature-request doc missing');
    const readme = fs.readFileSync(README, 'utf8');
    assert.match(readme, /docs\/components-piece\.md/);
  });
});

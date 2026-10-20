'use strict';

/**
 * FR #4572: root VISION.md so MRB can quote product vision without hunting
 * only under docs/. Canonical pack remains docs/vision.md.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ROOT_VISION = path.join(ROOT, 'VISION.md');
const DOCS_VISION = path.join(ROOT, 'docs', 'vision.md');

describe('FR #4572 root VISION.md', () => {
  it('VISION.md exists at repo root', () => {
    assert.ok(fs.existsSync(ROOT_VISION), 'missing VISION.md at repo root');
  });

  it('docs/vision.md remains the canonical LOCKED pack', () => {
    assert.ok(fs.existsSync(DOCS_VISION), 'missing docs/vision.md');
    const docs = fs.readFileSync(DOCS_VISION, 'utf8');
    assert.match(docs, /# Vision: a-search/);
    assert.match(docs, /\bLOCKED\b/);
  });

  it('root VISION.md points at docs/vision.md and quotes MRB themes', () => {
    const text = fs.readFileSync(ROOT_VISION, 'utf8');
    assert.match(text, /docs\/vision\.md/);
    assert.match(text, /a-clubs/i);
    assert.match(text, /\bIN\//);
    assert.match(text, /DLQ|429|paced/i);
    assert.match(text, /affiliate|JWT|fan-?out/i);
  });
});

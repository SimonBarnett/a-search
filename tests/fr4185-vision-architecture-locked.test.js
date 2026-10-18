'use strict';

/**
 * FR #4185: Architecture section closes with LOCKED; docs/vision.md pinned eol=lf
 * so WinPS autocrlf checkouts keep \\nLOCKED\\n for fr055h.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const visionPath = path.join(root, 'docs', 'vision.md');

describe('FR #4185 vision Architecture LOCKED fence', () => {
  it('Architecture closes with LOCKED before Screens (CRLF-tolerant)', () => {
    const text = fs.readFileSync(visionPath, 'utf8');
    const start = text.indexOf('## Architecture');
    assert.ok(start >= 0, 'missing ## Architecture');
    const rest = text.slice(start);
    const m = /\r?\nLOCKED\r?\n/.exec(rest);
    assert.ok(m, 'missing LOCKED after Architecture');
    const lockedAt = start + m.index;
    const screens = text.indexOf('## Screens', lockedAt);
    assert.ok(screens > lockedAt, 'LOCKED must precede ## Screens');
  });

  it('.gitattributes pins docs/vision.md to eol=lf', () => {
    const ga = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
    assert.match(ga, /docs\/vision\.md\s+text\s+eol=lf/);
  });
});

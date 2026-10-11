'use strict';

/**
 * FR-181 / #1028: Amazon Creators coexistence with PA-API — docs lock only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

describe('FR-181 Amazon Creators coexistence docs', () => {
  it('FR-181 Decision LOCKED: behind a feature flag; PA-API remains; points to FR-182', () => {
    const fr = utf8NoBom('docs/fr/FR-181.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /behind a feature flag/i);
    assert.match(fr, /PA-API SearchItems remains/);
    assert.match(fr, /FR-182/);
    assert.doesNotMatch(fr, /Creators replaces PA-API/i);
  });

  it('provider-shortlist locks FR-181 coexistence needles', () => {
    const text = utf8NoBom('docs/provider-shortlist.md');
    assert.match(text, /Amazon Creators coexistence \(FR-181\)/);
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /behind a feature flag/i);
    assert.match(text, /PA-API SearchItems remains/);
    assert.match(text, /FR-182/);
  });

  it('amazon skill mirrors FR-181 coexistence lock', () => {
    const text = utf8NoBom(
      'providers/live/amazon/.grok/skills/a-search-amazon/SKILL.md',
    );
    assert.match(text, /FR-181/);
    assert.match(text, /behind a feature flag/i);
    assert.match(text, /PA-API SearchItems remains/);
    assert.match(text, /FR-182/);
  });
});

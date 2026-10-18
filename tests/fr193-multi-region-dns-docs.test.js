'use strict';

/**
 * FR-193 / #1040: multi-region DNS failover runbook (docs-first).
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

describe('FR-193 multi-region DNS docs', () => {
  it('multi-region-dns.md Decision LOCKED + placeholders + failover', () => {
    const text = utf8NoBom('docs/multi-region-dns.md');
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /failover/i);
    assert.match(text, /Route53|DNS/);
    assert.match(text, /<api-hostname>/);
    assert.match(text, /<primary-api-target>/);
    assert.match(text, /<standby-api-target>/);
    assert.match(text, /active-passive|FR-190/);
    assert.match(text, /IONOS|SQL/);
  });

  it('FR-193.md Decision LOCKED points at multi-region-dns.md', () => {
    const fr = utf8NoBom('docs/fr/FR-193.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /multi-region-dns\.md/);
    assert.match(fr, /docs-first|No CDK DNS/i);
  });

  it('multi-region.md links FR-193 runbook', () => {
    const mr = utf8NoBom('docs/multi-region.md');
    assert.match(mr, /multi-region-dns\.md/);
    assert.match(mr, /FR-193/);
  });
});

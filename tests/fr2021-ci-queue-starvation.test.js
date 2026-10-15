'use strict';

/**
 * FR-2021: CI queue starvation - concurrency + path-aware synth skip.
 * Job id stays test-and-synth for ruleset required-ci-3948.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'ci.yml');
const frPath = path.join(root, 'docs', 'fr', 'FR-2021.md');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR-2021 CI queue starvation gate', () => {
  it('ci.yml keeps test-and-synth + concurrency cancel-in-progress + path-aware synth', () => {
    const text = utf8NoBom('.github/workflows/ci.yml');
    assert.match(text, /test-and-synth:/);
    assert.match(text, /\bconcurrency:\s*\n/);
    assert.match(text, /cancel-in-progress:\s*true/);
    assert.match(text, /a-search-ci-/);
    assert.match(text, /need_synth|Detect CDK-relevant paths/);
    assert.match(text, /synth=false|docs-harvest-or-tests-only/);
    assert.match(text, /npm run synth/);
    assert.match(text, /timeout-minutes:\s*180/);
    assert.match(text, /node-version:\s*['"]?20['"]?/);
    assert.match(text, /\bnpm ci\b/);
    assert.match(text, /\bnpm test\b/);
    // Required ruleset context name must remain the primary job id.
    assert.match(text, /jobs:[\s\S]*?\n\s*test-and-synth:/);
  });

  it('docs/fr/FR-2021.md Decision LOCKED ASCII no-BOM', () => {
    const text = utf8NoBom('docs/fr/FR-2021.md');
    assert.match(text, /Decision\s*\(LOCKED\)/i);
    assert.match(text, /required-ci-3948|test-and-synth/);
    assert.match(text, /cancel-in-progress|concurrency/i);
    assert.match(text, /path-aware|docs\/harvest|synth skip/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text), 'FR-2021.md must be printable ASCII');
  });

  it('release-gap CI row still Yes and cites FR-2021 path-aware synth', () => {
    const gap = utf8NoBom('docs/release-gap-aws-installable-2026-10-09.md');
    assert.match(gap, /\.github\/workflows/);
    assert.match(gap, /\*\*Yes\*\*/);
    assert.match(gap, /FR-2021|path-aware|concurrency/i);
  });
});

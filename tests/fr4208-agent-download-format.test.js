'use strict';

/**
 * FR #4208: docs pin that each s3://a-affiliates/{provider}/AGENT.md has a
 * Download format section (live S3; no AGENT.md copies in git).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs', 'a-affiliates.md');

describe('FR #4208 provider AGENT.md Download format', () => {
  it('docs/a-affiliates.md requires ## Download format on each provider AGENT.md', () => {
    const src = fs.readFileSync(DOCS, 'utf8');
    assert.match(src, /FR #4208|#4208/);
    assert.match(src, /## Provider AGENT\.md/);
    assert.match(src, /## Download format/);
    assert.match(src, /s3:\/\/a-affiliates\/\{provider\}\/AGENT\.md/);
    assert.match(src, /format.*csv.*tsv.*xml.*json/i);
    assert.match(src, /compression.*gzip.*zip.*none/i);
    assert.match(src, /yyyy-mm-dd/);
    assert.doesNotMatch(src, /\u2014|\u2013/);
  });
});

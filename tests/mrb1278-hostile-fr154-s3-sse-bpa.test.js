'use strict';

/**
 * MRB #1278 hostile: FR-154 ResultsBucket BPA/SSE-S3/enforceSSL/BucketOwnerEnforced.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function assertUtf8NoBomAscii(filePath, label) {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${label} must be UTF-8 without BOM`,
  );
  const text = buf.toString('utf8');
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII (hostile b<128)`,
  );
  return text;
}

describe('MRB-1278 FR-154 S3 SSE + BPA hostile', () => {
  it('stack ResultsBucket security props; no customer KMS', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /FR-154/);
    assert.match(text, /BlockPublicAccess\.BLOCK_ALL/);
    assert.match(text, /BucketEncryption\.S3_MANAGED/);
    assert.match(text, /enforceSSL:\s*true/);
    assert.match(text, /ObjectOwnership\.BUCKET_OWNER_ENFORCED/);
    assert.match(text, /publicReadAccess:\s*false/);
    assert.doesNotMatch(text, /BucketEncryption\.KMS(?!_MANAGED)/);
  });

  it('FR-154 LOCKED + gap Yes + pin ASCII + docs/mrb cites', () => {
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-154.md'),
      'docs/fr/FR-154.md',
    );
    assert.match(fr, /Decision\s+LOCKED/i);
    assert.match(fr, /BlockPublicAccess|S3_MANAGED|BUCKET_OWNER_ENFORCED/);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /S3 SSE \+ BlockPublicAccess[\s\S]{0,100}\*\*Yes\*\*/i);
    const pin = assertUtf8NoBomAscii(
      path.join(root, 'tests', 'fr154-s3-sse-block-public.test.js'),
      'tests/fr154-s3-sse-block-public.test.js',
    );
    assert.match(pin, /FR-154/);
    const mrb = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'mrb', 'mrb-1278.md'),
      'docs/mrb/mrb-1278.md',
    );
    assert.match(mrb, /#1278|#997|FR-154/);
  });
});

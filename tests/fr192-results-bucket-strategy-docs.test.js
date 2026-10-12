'use strict';

/**
 * FR-192 / #1039: multi-region results bucket strategy = region-local (no CRR).
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

describe('FR-192 results bucket strategy docs + CDK', () => {
  it('multi-region.md + FR-192 Decision LOCKED region-local (no CRR)', () => {
    const mr = utf8NoBom('docs/multi-region.md');
    assert.match(mr, /Results bucket strategy \(FR-192\)/);
    assert.match(mr, /Decision \(LOCKED\)/);
    assert.match(mr, /region-local/i);
    assert.match(mr, /CRR/);
    assert.match(mr, /IONOS|SQL/);
    const fr = utf8NoBom('docs/fr/FR-192.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /region-local/i);
    assert.match(fr, /ResultsBucket/);
  });

  it('CDK ResultsBucket documents FR-192 region-local (no replication constructs)', () => {
    const stack = utf8NoBom('cdk/lib/a-search-stack.js');
    assert.match(stack, /FR-192/);
    assert.match(stack, /region-local/);
    assert.match(stack, /no S3 CRR|No S3 CRR/i);
    assert.doesNotMatch(stack, /CfnBucket\w*Replication|ReplicationConfiguration/);
    assert.match(stack, /ResultsBucket/);
  });

  it('deploy.md notes region-local results', () => {
    const deploy = utf8NoBom('docs/deploy.md');
    assert.match(deploy, /FR-192/);
    assert.match(deploy, /region-local/i);
  });
});

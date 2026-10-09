'use strict';

/** docs/mrb-1061: hostile pins for FR-124 rclone X: + one-bucket scheme (PR #1061). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1061 hostile FR-124 rclone + S3', () => {
  it('vision keeps FR-124 X: lock contiguous with FR-121 sandbox MSSQL lock', () => {
    const text = read('docs/vision.md');
    assert.match(text, /LOCKED \(FR-124\).*X:/s);
    assert.match(text, /one dedicated results bucket/);
    assert.match(text, /live\/[\s\S]{0,8}sandbox\//);
    assert.match(text, /LOCKED \(FR-121\).*separate database/s);
    assert.doesNotMatch(text, /^- Exact rclone drive letter/m);
    assert.doesNotMatch(
      text,
      /^- One S3 bucket with `live`\/`sandbox`\/ prefixes vs two buckets/m,
    );
    assert.doesNotMatch(text, /<<<<<<<|=======|>>>>>>>/);
  });

  it('rclone-results.md pins X: + rejects legacy madeira-results-bucket root reuse', () => {
    const text = read('docs/rclone-results.md');
    assert.match(text, /FR-124/);
    assert.match(text, /\*\*`X:`\*\*/);
    assert.match(text, /ops may remap/i);
    assert.match(text, /A_SEARCH_RCLONE_ROOT/);
    assert.match(text, /madeira-results-bucket/);
    assert.match(text, /Do \*\*not\*\* reuse|not[\s\S]{0,40}reuse/i);
    assert.doesNotMatch(text, /A_SEARCH_RCLONE_ROOT=S:\\/);
  });

  it('environments.md Results storage rejects two-bucket as default', () => {
    const text = read('docs/environments.md');
    assert.match(text, /## Results storage \+ rclone \(LOCKED -- FR-124\)/);
    assert.match(text, /\*\*`X:`\*\*/);
    assert.match(text, /Rejected as default/);
    assert.match(text, /Two buckets/);
    assert.match(
      text,
      /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/,
    );
  });

  it('product FR-124 test module remains on main', () => {
    const p = path.join(root, 'tests', 'fr124-rclone-s3-scheme.test.js');
    assert.ok(fs.existsSync(p), 'fr124-rclone-s3-scheme.test.js missing');
    const t = fs.readFileSync(p, 'utf8');
    assert.match(t, /FR-124/);
    assert.match(t, /A_SEARCH_RCLONE_ROOT/);
    assert.match(t, /ops may remap/i);
  });
});

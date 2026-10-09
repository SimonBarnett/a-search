'use strict';

/** FR-124: LOCK rclone drive letter default + one-bucket live/sandbox prefix scheme */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('FR-124 rclone + S3 scheme', () => {
  it('rclone-results.md locks X: default + one-bucket prefixes + A_SEARCH_RCLONE_ROOT', () => {
    const text = read('docs/rclone-results.md');
    assert.match(text, /FR-124/);
    assert.match(text, /\bX:\\/);
    assert.match(text, /A_SEARCH_RCLONE_ROOT/);
    assert.match(text, /S3_RESULTS_BUCKET/);
    assert.match(text, /one[\s\S]{0,40}bucket|single[\s\S]{0,40}bucket/i);
    assert.match(text, /live\/|`live`\//);
    assert.match(text, /sandbox\//);
    assert.match(text, /ops may remap/i);
    assert.match(text, /madeira-results-bucket|legacy/i);
    // Docs must not present S: as the LOCKED host default.
    assert.doesNotMatch(text, /LOCKED[\s\S]{0,80}S:\\/i);
    assert.doesNotMatch(text, /A_SEARCH_RCLONE_ROOT=S:\\/i);
  });

  it('environments.md Results storage aligns with FR-124 (X: + one bucket)', () => {
    const text = read('docs/environments.md');
    assert.match(text, /## Results storage \+ rclone/);
    assert.match(text, /FR-124/);
    assert.match(text, /\bX:\\/);
    assert.match(
      text,
      /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/,
    );
    assert.match(text, /one[\s\S]{0,60}bucket|prefix-under-one-bucket|single results bucket/i);
    assert.doesNotMatch(
      text,
      /drive letters UNKNOWN until deploy/i,
    );
    // Two-bucket must not be the chosen default.
    assert.match(text, /Rejected|not the default|LOCKED default/i);
  });

  it('vision UNKNOWN no longer lists drive letter / one-vs-two as open', () => {
    const text = read('docs/vision.md');
    assert.match(text, /FR-124/);
    assert.doesNotMatch(
      text,
      /^- Exact rclone drive letter/m,
    );
    assert.doesNotMatch(
      text,
      /^- One S3 bucket with `live`\/`sandbox`\/ prefixes vs two buckets/m,
    );
  });

  it('IaC / shared path helpers do not invent a two-bucket scheme', () => {
    const resultsPath = read('shared/resultsPath.js');
    assert.match(resultsPath, /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/);
    // Single key layout with env prefix (one bucket).
    assert.match(resultsPath, /\$\{p\.env\}\/\$\{p\.source\}/);
    const stack = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
    if (fs.existsSync(stack)) {
      const cdk = read('cdk/lib/a-search-stack.js');
      assert.doesNotMatch(cdk, /RESULTS_BUCKET_LIVE|RESULTS_BUCKET_SANDBOX/);
    }
  });
});

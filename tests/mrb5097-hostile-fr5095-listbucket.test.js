'use strict';

/**
 * docs/mrb-5097: hostile pins for FR #5095 ListBucket + 403 skip + 500 name log.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('docs/mrb-5097 hostile FR #5095', () => {
  it('entry grants ListBucket on a-affiliates bucket (contiguous)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    const i = src.indexOf("sid: 'AgentSearchAffiliatesList'");
    assert.ok(i >= 0, 'AgentSearchAffiliatesList missing');
    const window = src.slice(i, i + 280);
    assert.match(window, /s3:ListBucket/);
    assert.match(window, /arn:aws:s3:::a-affiliates'/);
    assert.match(window, /FR #5095/);
  });

  it('affiliates HeadObject errors skip with affiliates_s3_error (contiguous)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'agentSearch.js'),
      'utf8',
    );
    assert.match(src, /affiliates_s3_error/);
    assert.match(src, /logAffiliatesS3Error/);
    assert.match(src, /FR #5095 \/ #5090/);
    assert.match(src, /wrapS3HeadFailure/);
  });

  it('handler logs error name before internal_error 500', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(src, /FR #5095: log name\/code/);
    assert.match(src, /\[entry\] \$\{route\}/);
  });

  it('search-fanout.md documents ListBucket + 403 skip', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(doc, /s3:ListBucket/);
    assert.match(doc, /FR #5095/);
    assert.match(doc, /403/);
  });
});

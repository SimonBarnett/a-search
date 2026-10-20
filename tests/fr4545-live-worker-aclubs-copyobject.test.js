'use strict';

/**
 * FR #4545: live provider workers AccessDenied on rewriteMarkerMetadata CopyObject.
 * wireAclubsInAccess must grant s3:CopyObject (+ tagging) — grantReadWrite alone
 * does not cover CopyObject used by touchLastmod after IN/ write (FR #4441).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');

describe('FR #4545 live worker a-clubs CopyObject IAM', () => {
  it('wireAclubsInAccess grants CopyObject and object tagging on a-clubs', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    const start = src.indexOf('function wireAclubsInAccess');
    assert.ok(start >= 0, 'wireAclubsInAccess missing');
    const end = src.indexOf('\nfunction ', start + 1);
    const block = end > start ? src.slice(start, end) : src.slice(start, start + 1200);
    assert.match(block, /grantReadWrite/);
    assert.match(block, /s3:CopyObject/);
    assert.match(block, /s3:GetObjectTagging/);
    assert.match(block, /s3:PutObjectTagging/);
    assert.match(block, /addToRolePolicy|PolicyStatement/);
    assert.match(block, /a-clubs|arnForObjects|bucket\.bucketArn|arn:aws:s3:::/);
  });

  it('live workers still call wireAclubsInAccess (ebay path uses touchLastmod)', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    assert.match(src, /wireAclubsInAccess\(worker,\s*aClubsBucket\)/);
  });

  it('rewriteMarkerMetadata prefers copyObject (AccessDenied surface)', () => {
    const host = fs.readFileSync(
      path.join(ROOT, 'shared', 'widgets', 'hostFolderMeta.js'),
      'utf8',
    );
    assert.match(host, /async function rewriteMarkerMetadata/);
    assert.match(host, /opts\.copyObject/);
    assert.match(host, /CopySource/);
  });
});

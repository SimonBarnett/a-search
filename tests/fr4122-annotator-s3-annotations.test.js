'use strict';

/**
 * FR #4122: APartsGateway grants a-search-redqueen-annotator S3 object-annotation
 * actions on a-clubs (follow-up to #4098).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'parts-gateway-stack.js');

const REQUIRED_ANNOTATION_ACTIONS = [
  's3:PutObjectAnnotation',
  's3:GetObjectAnnotation',
  's3:ListObjectAnnotations',
  's3:DeleteObjectAnnotation',
];

function redqueenAnnotateBlock(src) {
  const start = src.search(/sid:\s*['"]RedqueenAClubsAnnotate['"]/);
  assert.ok(start >= 0, 'RedqueenAClubsAnnotate statement missing');
  const end = src.indexOf('const logGroup', start);
  assert.ok(end > start, 'could not bound RedqueenAClubsAnnotate statement');
  return src.slice(start, end);
}

describe('FR #4122 redqueen annotator S3 object-annotation IAM', () => {
  it('parts-gateway-stack grants all four annotation actions on a-clubs', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    assert.match(src, /a-search-redqueen-annotator/);
    const block = redqueenAnnotateBlock(src);
    // Keep existing object actions on the annotator statement itself
    // (Lambda role already has PutObjectTagging; FR #4241 needs it here too).
    assert.match(block, /s3:GetObject/);
    assert.match(block, /s3:PutObject/);
    assert.match(block, /s3:ListBucket/);
    assert.match(block, /s3:GetObjectTagging/);
    assert.match(block, /s3:PutObjectTagging/);
    for (const action of REQUIRED_ANNOTATION_ACTIONS) {
      assert.match(
        block,
        new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `missing ${action} on RedqueenAClubsAnnotate`,
      );
    }
    assert.match(block, /arn:aws:s3:::\$\{A_CLUBS_BUCKET\}\/\*/);
    assert.match(block, /arn:aws:s3:::\$\{A_CLUBS_BUCKET\}`/);
    // Do not wire ASearchStack / RdsQueryApi / madeira into this stack.
    assert.equal(src.includes('ASearchStack'), false);
    assert.equal(/RdsQueryApi|madeira-/i.test(src), false);
  });

  it('docs/redqueen-annotations.md lists all four IAM annotation actions', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    for (const action of REQUIRED_ANNOTATION_ACTIONS) {
      const short = action.replace(/^s3:/, '');
      assert.match(
        doc,
        new RegExp(short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `docs missing ${action}`,
      );
    }
    assert.match(doc, /a-search-redqueen-annotator/);
    assert.match(doc, /FR #4122|#4122/);
    assert.match(doc, /PutObjectTagging/);
  });
});

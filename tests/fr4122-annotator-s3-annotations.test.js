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

describe('FR #4122 redqueen annotator S3 object-annotation IAM', () => {
  it('parts-gateway-stack grants all four annotation actions on a-clubs', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    assert.match(src, /a-search-redqueen-annotator/);
    assert.match(src, /sid:\s*['"]RedqueenAClubsAnnotate['"]/);
    // Keep existing object actions.
    assert.match(src, /s3:GetObject/);
    assert.match(src, /s3:PutObject/);
    assert.match(src, /s3:ListBucket/);
    assert.match(src, /s3:GetObjectTagging/);
    for (const action of REQUIRED_ANNOTATION_ACTIONS) {
      assert.match(
        src,
        new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `missing ${action}`,
      );
    }
    assert.match(src, /arn:aws:s3:::\$\{A_CLUBS_BUCKET\}\/\*/);
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
  });
});

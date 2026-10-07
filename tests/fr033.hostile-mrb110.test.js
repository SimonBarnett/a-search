'use strict';

/** Hostile pins for MRB a-search#110 / FR-033 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #110 hostile: FR-033 default S3 PutObject', () => {
  it('docs/mrb-110.md pins default PutObject + inject hooks', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'mrb-110.md'), 'utf8');
    assert.match(text, /PutObject|client-s3/);
    assert.match(text, /putObject|createS3Client/);
    assert.match(text, /S3_RESULTS_BUCKET/);
  });

  it('writeResults.js defaults to S3 when putObject omitted', () => {
    const text = fs.readFileSync(
      path.join(root, 'shared', 'writeResults.js'),
      'utf8',
    );
    assert.match(text, /@aws-sdk\/client-s3|S3Client|PutObject/);
    assert.match(text, /putObject/);
  });
});

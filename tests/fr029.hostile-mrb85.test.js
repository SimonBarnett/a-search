'use strict';

/** Hostile pins for MRB a-search#85 / FR-029 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const keyRe =
  /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/;

describe('MRB #85 hostile: FR-029 rclone-results docs', () => {
  it('docs/mrb-85.md pins canonical key and env vars', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'mrb-85.md'), 'utf8');
    assert.match(text, keyRe);
    assert.match(text, /A_SEARCH_RCLONE_ROOT/);
    assert.match(text, /S3_RESULTS_BUCKET/);
  });

  it('rclone-results.md matches resultsPath comment', () => {
    const doc = fs.readFileSync(
      path.join(root, 'docs', 'rclone-results.md'),
      'utf8',
    );
    const src = fs.readFileSync(
      path.join(root, 'worker', 'lib', 'resultsPath.js'),
      'utf8',
    );
    assert.match(doc, keyRe);
    assert.match(src, /\{env\}\/\{source\}\/\{userId\}/);
  });
});

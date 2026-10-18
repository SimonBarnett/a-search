'use strict';

/**
 * docs/mrb-4254 hostile: FR #4246 drain MaxNumberOfMessages default is 1;
 * no || 5 fallback; docs cite receipt expiry / one-message receive.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DRAIN = path.join(ROOT, 'redqueen', 'src', 'drain.js');
const DOCS = path.join(ROOT, 'docs', 'redqueen-annotations.md');

describe('MRB #4254 hostile FR #4246 drain one message', () => {
  it('DEFAULT_MAX_MESSAGES=1; nullish opts; no || 5', () => {
    const src = fs.readFileSync(DRAIN, 'utf8');
    assert.match(src, /DEFAULT_MAX_MESSAGES\s*=\s*1\b/);
    assert.match(
      src,
      /MaxNumberOfMessages:\s*[\s\S]*?opts\.maxMessages\s*==\s*null\s*\?\s*DEFAULT_MAX_MESSAGES/,
    );
    assert.doesNotMatch(src, /MaxNumberOfMessages:\s*opts\.maxMessages\s*\|\|\s*5\b/);
    assert.match(src, /module\.exports[\s\S]*DEFAULT_MAX_MESSAGES/);
  });

  it('docs pin one-message receive and receipt expiry', () => {
    const doc = fs.readFileSync(DOCS, 'utf8');
    assert.match(doc, /FR #4246|MaxNumberOfMessages\s*=\s*1|one.*message/i);
    assert.match(doc, /expired|receipt/i);
    assert.match(doc, /VisibilityTimeout|heartbeat/i);
  });
});

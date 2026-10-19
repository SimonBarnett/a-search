'use strict';
/**
 * MRB #4378 originally pinned Entry Lambda merchantConnect staging.
 * FR #4387 / Design #4376 supersede that: do not stage merchant adapters.
 * This pin now asserts the staging lesson is gone and Design remains.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const book = fs
  .readFileSync(
    path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
    'utf8',
  )
  .replace(/\r\n/g, '\n');

const prior =
  'On WinPS StrictMode, optional searches.json fields such as market must be read via PSObject.Properties. A missing property throws, so an older queries-only file looks like a product failure.';
const superseded =
  'Entry Lambda staging: merchantConnect provider src must be copied into the asset even when the source is disabled for selftest; shop adapters eager-require those modules at init.';
const design =
  'FR #4376: /search entry must not stage or load merchant shop adapters; strip shared/shops from the staged asset and lazy-require shop routes';

describe('MRB #4378 / FR #4387 merchantConnect staging superseded', () => {
  it('drops staging lesson; keeps StrictMode then Design contiguous', () => {
    assert.equal(book.includes(superseded), false, 'superseded staging lesson gone');
    assert.ok(book.includes(prior + '\n- ' + design), 'contiguous prior then Design lesson');
    assert.equal(book.includes('\uFEFF'), false);
  });
});

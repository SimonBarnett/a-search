'use strict';
/**
 * MRB #4378: Entry Lambda must stage merchantConnect provider src.
 * Newlines normalized for LF/CRLF checkouts.
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
const lesson =
  'Entry Lambda staging: merchantConnect provider src must be copied into the asset even when the source is disabled for selftest; shop adapters eager-require those modules at init.';

describe('MRB #4378 merchantConnect staging lesson', () => {
  it('keeps the StrictMode bullet and appends the Entry Lambda staging bullet', () => {
    assert.ok(book.includes(prior + '\n- ' + lesson), 'contiguous prior then lesson');
    assert.equal(book.includes('\uFEFF'), false);
  });
});

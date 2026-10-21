'use strict';

/**
 * MRB #4798 hostile: FR #4794 pins use example.test SearchApiUrl (not live)
 * and pair with each Register -File spawn in fr4231/fr4240.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('MRB #4798 hostile FR #4794 SearchApiUrl', () => {
  for (const name of [
    'fr4231-reviewer-service-logon.test.js',
    'fr4240-grok-home-localsystem.test.js',
  ]) {
    it(`${name} pairs -SearchApiUrl with https://example.test/a-search`, () => {
      const src = fs.readFileSync(path.join(__dirname, name), 'utf8');
      assert.match(src, /'-SearchApiUrl'/);
      assert.match(src, /https:\/\/example\.test\/a-search/);
      // Every SearchApiUrl flag should be followed by the fake URL nearby.
      const blocks = src.split(/'-SearchApiUrl'/);
      assert.ok(blocks.length >= 3, 'at least two -SearchApiUrl occurrences');
      for (let i = 1; i < blocks.length; i += 1) {
        assert.match(
          blocks[i].slice(0, 120),
          /https:\/\/example\.test\/a-search/,
          `SearchApiUrl #${i} missing example.test URL`,
        );
      }
    });
  }
});

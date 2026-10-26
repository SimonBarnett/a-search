'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vision = fs.readFileSync(path.join(__dirname, '..', 'VISION.md'), 'utf8');
describe('docs/mrb-5199 VISION _search-done', () => {
  it('VISION tracks terminals at _search-done not GUID DONE/', () => {
    assert.match(vision, /_search-done\/\{searchid\}\/\{source\}\.json/);
    assert.match(vision, /FR #5198/);
    assert.match(vision, /never `a-clubs\/\{host\}\/\{guid\}\/DONE\//);
    assert.doesNotMatch(
      vision,
      /Completion without an IN file is a `DONE\/\{searchid\}-\{source\}\.json` marker/,
    );
  });
});
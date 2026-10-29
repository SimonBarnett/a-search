'use strict';

/**
 * docs/mrb-5277: FR #5271 hostile pins — no queries/exclude on IN writers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function walkJs(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(abs, out);
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(abs);
  }
}

describe('docs/mrb-5277 FR #5271 no queries/exclude on IN writers', () => {
  it('provider workers do not pass queries/exclude into IN write', () => {
    const files = [];
    walkJs(path.join(ROOT, 'providers'), files);
    walkJs(path.join(ROOT, 'redqueen', 'sql-search-drain'), files);
    const leaks = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (/queries\s*:\s*msg\.queries/.test(src) || /exclude\s*:\s*msg\.exclude/.test(src)) {
        leaks.push(path.relative(ROOT, f));
      }
    }
    assert.deepEqual(leaks, []);
  });

  it('writeLiveProviderInResult JSDoc and call omit queries/exclude', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'search', 'writeLiveProviderInResult.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /queries\?\s*:\s*unknown/);
    assert.doesNotMatch(src, /exclude\?\s*:\s*unknown/);
    assert.doesNotMatch(src, /queries:\s*opts\.queries|queries:\s*msg\.queries/);
    assert.doesNotMatch(src, /exclude:\s*opts\.exclude|exclude:\s*msg\.exclude/);
  });

  it('inResultSchema buildInResult source has no queries parameter', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'search', 'inResultSchema.js'),
      'utf8',
    );
    assert.match(src, /FR #5271/);
    assert.doesNotMatch(src, /queries,\s*\n\s*exclude/);
  });
});
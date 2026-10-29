'use strict';

/**
 * docs/mrb-5279: FR #5271 shared IN writers and walrus omit queries/exclude.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('docs/mrb-5279 shared + walrus IN writers omit queries/exclude', () => {
  it('writeInResultS3 / writeAClubsIn / writeResults do not assign queries or exclude', () => {
    const files = [
      path.join(ROOT, 'shared', 'search', 'writeInResultS3.js'),
      path.join(ROOT, 'walrus', 'src', 'writeAClubsIn.js'),
      path.join(ROOT, 'shared', 'writeResults.js'),
    ];
    const leaks = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (
        /queries\s*:\s*(msg|opts|raw)\.queries/.test(src) ||
        /exclude\s*:\s*(msg|opts|raw)\.exclude/.test(src)
      ) {
        leaks.push(path.relative(ROOT, f));
      }
    }
    assert.deepEqual(leaks, []);
  });
});

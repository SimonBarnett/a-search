'use strict';

/** FR-047c: writeResults lives under shared/, not worker/lib */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-047c writeResults in shared/', () => {
  it('shared/writeResults.js exists; worker/lib copy gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'shared', 'writeResults.js')));
    assert.equal(
      fs.existsSync(path.join(root, 'worker', 'lib', 'writeResults.js')),
      false,
    );
  });

  it('provider workers require shared/writeResults', () => {
    const workers = [
      'providers/live/amazon/src/worker.js',
      'providers/live/ebay/src/worker.js',
      'providers/local/awin/src/worker.js',
    ];
    for (const rel of workers) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(
        src,
        /require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/writeResults['"]\)/,
        rel,
      );
      assert.doesNotMatch(src, /worker\/lib\/writeResults/, rel);
    }
  });
});

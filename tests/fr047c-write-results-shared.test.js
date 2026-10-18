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

  it('provider workers use shared writeResults (direct or via writeLiveProviderInResult)', () => {
    // FR #4038: live workers call writeLiveProviderInResult, which requires
    // shared/writeResults for the legacy path; local workers may require it directly.
    const helper = fs.readFileSync(
      path.join(root, 'shared/search/writeLiveProviderInResult.js'),
      'utf8',
    );
    assert.match(
      helper,
      /require\(['"]\.\.\/writeResults['"]\)/,
      'writeLiveProviderInResult must require shared/writeResults',
    );

    const workers = [
      'providers/live/amazon/src/worker.js',
      'providers/live/ebay/src/worker.js',
      'providers/local/awin/src/worker.js',
    ];
    for (const rel of workers) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      const direct = /require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/writeResults['"]\)/.test(
        src,
      );
      const viaIn = /require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/search\/writeLiveProviderInResult['"]\)/.test(
        src,
      );
      assert.ok(
        direct || viaIn,
        `${rel} must require shared/writeResults or shared/search/writeLiveProviderInResult`,
      );
      assert.doesNotMatch(src, /worker\/lib\/writeResults/, rel);
    }
  });
});

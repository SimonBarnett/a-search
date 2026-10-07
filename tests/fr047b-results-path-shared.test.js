'use strict';

/** FR-047b: resultsPath lives under shared/, not worker/lib */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-047b resultsPath in shared/', () => {
  it('shared/resultsPath.js exists; worker/lib copy gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'shared', 'resultsPath.js')));
    assert.equal(
      fs.existsSync(path.join(root, 'worker', 'lib', 'resultsPath.js')),
      false,
    );
  });

  it('writeResults requires shared/resultsPath', () => {
    const src = fs.readFileSync(
      path.join(root, 'worker', 'lib', 'writeResults.js'),
      'utf8',
    );
    assert.match(src, /require\(['"]\.\.\/\.\.\/shared\/resultsPath['"]\)/);
    assert.doesNotMatch(src, /require\(['"]\.\/resultsPath['"]\)/);
  });
});

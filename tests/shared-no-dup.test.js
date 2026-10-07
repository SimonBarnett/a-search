'use strict';

/**
 * FR-047f: providers must not ship forked resultsPath / writeResults copies.
 * Canonical helpers live under shared/ (see docs/shared-layer.md).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const providersRoot = path.join(root, 'providers');

const FORBIDDEN_BASENAMES = new Set([
  'resultsPath.js',
  'writeResults.js',
  'resultsKey.js',
]);

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walkJsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.grok') continue;
      walkJsFiles(full, out);
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      out.push(full);
    }
  }
}

function forbiddenUnderProviders() {
  const files = [];
  walkJsFiles(providersRoot, files);
  return files.filter((f) => FORBIDDEN_BASENAMES.has(path.basename(f)));
}

describe('FR-047f shared helpers — no provider duplicates', () => {
  it('providers/** must not contain resultsPath.js / writeResults.js copies', () => {
    const offenders = forbiddenUnderProviders();
    assert.deepEqual(
      offenders.map((f) => path.relative(root, f).split(path.sep).join('/')),
      [],
      'providers must not ship forked shared helpers; use shared/',
    );
  });

  it('fail-when: a synthetic provider resultsPath.js is detected then cleaned up', () => {
    const fakeDir = path.join(providersRoot, 'live', 'amazon', 'src');
    const fake = path.join(fakeDir, 'resultsPath.js');
    assert.equal(fs.existsSync(fake), false);
    fs.writeFileSync(fake, "'use strict';\n// MRB #406 hostile temp — must not remain\n", 'utf8');
    try {
      const offenders = forbiddenUnderProviders();
      const rel = offenders.map((f) =>
        path.relative(root, f).split(path.sep).join('/'),
      );
      assert.ok(
        rel.includes('providers/live/amazon/src/resultsPath.js'),
        `expected synthetic offender in ${JSON.stringify(rel)}`,
      );
    } finally {
      fs.unlinkSync(fake);
    }
    assert.deepEqual(forbiddenUnderProviders(), []);
  });
});

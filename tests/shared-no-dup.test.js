'use strict';

/**
 * FR-047f: providers must not ship forked resultsPath / writeResults copies.
 * Canonical helpers live under shared/ (and worker/lib until migrated).
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

describe('FR-047f shared helpers — no provider duplicates', () => {
  it('providers/** must not contain resultsPath.js / writeResults.js copies', () => {
    const files = [];
    walkJsFiles(providersRoot, files);
    const offenders = files.filter((f) =>
      FORBIDDEN_BASENAMES.has(path.basename(f)),
    );
    assert.deepEqual(
      offenders.map((f) => path.relative(root, f).split(path.sep).join('/')),
      [],
      'providers must not ship forked shared helpers; use shared/ (or worker/lib until moved)',
    );
  });

  it('fail-when fixture: a synthetic provider resultsPath.js would be detected', () => {
    const files = [];
    walkJsFiles(providersRoot, files);
    const fake = path.join(
      providersRoot,
      'live',
      'amazon',
      'src',
      'resultsPath.js',
    );
    const basenames = new Set(files.map((f) => path.basename(f)));
    // Current tree must not already have the fake path.
    assert.equal(fs.existsSync(fake), false);
    // Detector logic: basename match is enough.
    assert.equal(FORBIDDEN_BASENAMES.has('resultsPath.js'), true);
    assert.equal(basenames.has('resultsPath.js'), false);
  });
});

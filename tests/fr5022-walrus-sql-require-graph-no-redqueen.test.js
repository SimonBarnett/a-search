'use strict';

/**
 * FR #5022: walrus SQL drain require graph must not touch redqueen/.
 * Chain that previously MODULE_NOT_FOUND on walrus:
 *   providers/local/sql -> writeLiveProviderInResult -> searchDone
 *   -> promoteInToLive -> pageSelect (now shared/widgets).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');

const REQUIRE_RE =
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * @param {string} fromFile
 * @param {string} spec
 * @returns {string|null}
 */
function resolveRepoModule(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  let abs = path.normalize(path.join(path.dirname(fromFile), spec));
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    abs = path.join(abs, 'index.js');
  } else if (!abs.endsWith('.js')) {
    if (fs.existsSync(`${abs}.js`)) abs = `${abs}.js`;
    else if (fs.existsSync(path.join(abs, 'index.js'))) {
      abs = path.join(abs, 'index.js');
    } else {
      return null;
    }
  }
  if (!fs.existsSync(abs)) return null;
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..')) return null;
  return abs;
}

/**
 * Static relative-require closure from entry files.
 * @param {string[]} entryAbs
 * @returns {string[]}
 */
function walkRelativeRequires(entryAbs) {
  const seen = new Set();
  const queue = [...entryAbs];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    REQUIRE_RE.lastIndex = 0;
    let m;
    while ((m = REQUIRE_RE.exec(src))) {
      const next = resolveRepoModule(file, m[1]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

describe('FR #5022 walrus SQL require graph has no redqueen', () => {
  it('static graph from walrus/src/index.js + sql worker omits redqueen/', () => {
    const entries = [
      path.join(ROOT, 'walrus', 'src', 'index.js'),
      path.join(ROOT, 'providers', 'local', 'sql', 'src', 'worker.js'),
      path.join(ROOT, 'shared', 'search', 'writeLiveProviderInResult.js'),
      path.join(ROOT, 'shared', 'widgets', 'promoteInToLive.js'),
    ];
    for (const e of entries) {
      assert.equal(fs.existsSync(e), true, 'missing ' + e);
    }
    const files = walkRelativeRequires(entries);
    const redqueenHits = files
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
      .filter((rel) => rel === 'redqueen' || rel.startsWith('redqueen/'));
    assert.deepEqual(
      redqueenHits,
      [],
      'SQL drain graph must not include redqueen; got ' + redqueenHits.join(', '),
    );
    const pageSelect = files.find((f) =>
      /shared[\\/]widgets[\\/]pageSelect\.js$/.test(f),
    );
    assert.ok(pageSelect, 'graph must include shared/widgets/pageSelect.js');
  });

  it('fail-when: loading promoteInToLive with redqueen resolve blocked', () => {
    for (const key of Object.keys(require.cache)) {
      const norm = key.replace(/\\/g, '/');
      if (
        norm.includes('/shared/widgets/') ||
        norm.includes('/shared/search/') ||
        norm.includes('/redqueen/')
      ) {
        delete require.cache[key];
      }
    }
    const orig = Module._resolveFilename;
    Module._resolveFilename = function patched(request, parent, isMain, options) {
      const resolved = orig.call(this, request, parent, isMain, options);
      if (/[/\\]redqueen[/\\]/.test(String(resolved))) {
        const err = new Error(
          `Cannot find module '${request}' (FR #5022: redqueen blocked)`,
        );
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }
      return resolved;
    };
    try {
      const mod = require('../shared/widgets/promoteInToLive');
      assert.equal(typeof mod.promoteInToLive, 'function');
      const done = require('../shared/search/searchDone');
      assert.equal(typeof done.recordSearchTerminal, 'function');
    } finally {
      Module._resolveFilename = orig;
    }
  });
});

'use strict';

/**
 * FR #5022: shared/ must not require redqueen/, walrus/, or entry/.
 * pageSelect lives in shared/widgets so walrus SQL drain needs no redqueen/src.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');

const REQUIRE_RE =
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listJsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsFiles(full));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * @param {string} fromFile
 * @param {string} spec
 * @returns {string|null} normalized posix path under repo, or null if not relative
 */
function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.normalize(path.join(path.dirname(fromFile), spec));
  let withJs = abs;
  if (!withJs.endsWith('.js') && fs.existsSync(`${withJs}.js`)) {
    withJs = `${withJs}.js`;
  } else if (!withJs.endsWith('.js') && fs.existsSync(path.join(withJs, 'index.js'))) {
    withJs = path.join(withJs, 'index.js');
  }
  const rel = path.relative(ROOT, withJs).split(path.sep).join('/');
  return rel;
}

describe('FR #5022 shared boundary: no redqueen/walrus/entry requires', () => {
  it('shared/widgets/pageSelect.js exists and exports filterPartsByPage', () => {
    const mod = require('../shared/widgets/pageSelect');
    assert.equal(typeof mod.filterPartsByPage, 'function');
    assert.equal(typeof mod.hostPageExcludes, 'function');
    const legacy = mod.filterPartsByPage([{ title: 'x' }], {});
    assert.equal(legacy.length, 1);
  });

  it('redqueen/src/pageSelect.js re-exports shared', () => {
    const shared = require('../shared/widgets/pageSelect');
    const rq = require('../redqueen/src/pageSelect');
    assert.equal(rq.filterPartsByPage, shared.filterPartsByPage);
  });

  it('promoteInToLive and agentIngest require ./pageSelect', () => {
    const promote = fs.readFileSync(
      path.join(SHARED, 'widgets', 'promoteInToLive.js'),
      'utf8',
    );
    const ingest = fs.readFileSync(
      path.join(SHARED, 'widgets', 'agentIngest.js'),
      'utf8',
    );
    assert.match(promote, /require\('\.\/pageSelect'\)/);
    assert.match(ingest, /require\('\.\/pageSelect'\)/);
    assert.equal(promote.includes('redqueen/src/pageSelect'), false);
    assert.equal(ingest.includes('redqueen/src/pageSelect'), false);
  });

  it('fail-when: no shared/*.js requires redqueen/, walrus/, or entry/', () => {
    const hits = [];
    for (const file of listJsFiles(SHARED)) {
      const src = fs.readFileSync(file, 'utf8');
      REQUIRE_RE.lastIndex = 0;
      let m;
      while ((m = REQUIRE_RE.exec(src))) {
        const spec = m[1];
        const rel = resolveRelative(file, spec);
        if (!rel) continue;
        if (
          rel === 'redqueen' ||
          rel.startsWith('redqueen/') ||
          rel === 'walrus' ||
          rel.startsWith('walrus/') ||
          rel === 'entry' ||
          rel.startsWith('entry/')
        ) {
          hits.push(`${path.relative(ROOT, file).split(path.sep).join('/')}: ${spec} -> ${rel}`);
        }
      }
    }
    assert.deepEqual(hits, [], 'shared must not import redqueen/walrus/entry; got ' + hits.join('; '));
  });
});

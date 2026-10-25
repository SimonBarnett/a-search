'use strict';

/**
 * MRB #5025 / FR #5022: hostile pins --- pageSelect lives in shared/widgets;
 * promote/walrus path must not require redqueen/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('MRB #5025 hostile FR #5022 pageSelect shared', () => {
  it('promoteInToLive and agentIngest require ./pageSelect not redqueen', () => {
    const promote = read('shared/widgets/promoteInToLive.js');
    const ingest = read('shared/widgets/agentIngest.js');
    assert.match(promote, /require\(['"]\.\/pageSelect['"]\)/);
    assert.match(ingest, /require\(['"]\.\/pageSelect['"]\)/);
    assert.doesNotMatch(promote, /redqueen/);
    assert.doesNotMatch(ingest, /redqueen/);
  });

  it('canonical shared/widgets/pageSelect.js exports filterPartsByPage', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'shared', 'widgets', 'pageSelect.js')));
    const mod = require('../shared/widgets/pageSelect');
    assert.equal(typeof mod.filterPartsByPage, 'function');
  });

  it('redqueen/src/pageSelect.js re-exports shared', () => {
    const text = read('redqueen/src/pageSelect.js');
    assert.match(text, /require\(['"]\.\.\/\.\.\/shared\/widgets\/pageSelect['"]\)/);
    assert.ok(text.split(/\r?\n/).length < 20, 're-export stub stays thin');
  });

  it('stage script does not soft-copy redqueen pageSelect into required paths', () => {
    const text = read('scripts/stage-provider-worker-lambda-asset.js');
    assert.match(text, /FR #5022/);
    assert.doesNotMatch(
      text,
      /requiredWorkerAssetPaths[\s\S]*redqueen\/src\/pageSelect\.js/,
    );
    const {
      requiredWorkerAssetPaths,
    } = require('../scripts/stage-provider-worker-lambda-asset');
    const paths = requiredWorkerAssetPaths({ folder: 'providers/live/amazon' });
    assert.equal(
      paths.includes('redqueen/src/pageSelect.js'),
      false,
      'pageSelect must not be a required redqueen staged path',
    );
  });

  it('harvest lesson retargets pageSelect to shared/widgets', () => {
    const text = read('.grok/skills/harvest-agent-skills/SKILL.md');
    assert.match(
      text,
      /pageSelect lives in shared\/widgets \(FR #5022\)/,
    );
    assert.doesNotMatch(
      text,
      /copy redqueen\/src\/pageSelect\.js when present for promoteInToLive/,
    );
  });
});

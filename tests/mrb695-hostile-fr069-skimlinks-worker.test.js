'use strict';

/** MRB #695 hostile: FR-069 skimlinks worker stay-dark + no stub. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #695 hostile FR-069 skimlinks worker', () => {
  it('worker wires search normalize writeResults; no not-wired stub', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/skimlinks/src/worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /assertWorkerEnv/);
    assert.match(src, /searchSkimlinks/);
    assert.match(src, /normalizeSearchResponse/);
    assert.match(src, /writeResults/);
  });

  it('normalize reads skimlinksProductAPI and divides minor-unit price', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/skimlinks/src/normalize.js'),
      'utf8',
    );
    assert.match(src, /skimlinksProductAPI/);
    assert.match(src, /\/ 100|\/100/);
    assert.match(src, /SKIMLINKS_PUBLISHER_ID/);
    assert.doesNotMatch(src, /<<<<<<</);
  });

  it('registry stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/registry.json'), 'utf8'),
    );
    const sl = registry.sources.find((s) => s.id === 'skimlinks');
    assert.equal(sl.enabled.live, false);
    assert.equal(sl.enabled.sandbox, false);
  });
});

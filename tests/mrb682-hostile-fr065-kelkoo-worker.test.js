'use strict';

/** MRB #682 hostile: FR-065 kelkoo worker stay-dark + no stub. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #682 hostile FR-065 kelkoo worker', () => {
  it('worker wires search normalize writeResults; no not-wired stub', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/kelkoo/src/worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not wired yet/i);
    assert.match(src, /assertWorkerEnv/);
    assert.match(src, /searchKelkoo/);
    assert.match(src, /normalizeSearchResponse/);
    assert.match(src, /writeResults/);
  });

  it('normalize uses buildTrackedUrl + KELKOO_PUBLISHER_ID', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/kelkoo/src/normalize.js'),
      'utf8',
    );
    assert.match(src, /buildTrackedUrl/);
    assert.match(src, /KELKOO_PUBLISHER_ID/);
    assert.doesNotMatch(src, /<<<<<<</);
  });

  it('registry stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/registry.json'), 'utf8'),
    );
    const kk = registry.sources.find((s) => s.id === 'kelkoo');
    assert.equal(kk.enabled.live, false);
    assert.equal(kk.enabled.sandbox, false);
  });
});

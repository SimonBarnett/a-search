'use strict';

/** MRB #701 hostile: FR-070 skimlinks selftest + rateLimit stay-dark. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #701 hostile FR-070 skimlinks selftest', () => {
  it('selftestProbe uses searchSkimlinks + skimlinksProductAPI fixture shape', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/skimlinks/src/selftestProbe.js'),
      'utf8',
    );
    assert.match(src, /assertSkimlinksCreds/);
    assert.match(src, /searchSkimlinks|fixtureLooksOk/);
    assert.match(src, /skimlinksProductAPI/);
    assert.match(src, /Stay-dark|stay-dark|enabled stays false/i);
  });

  it('registry rateLimit positive; stay-dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/registry.json'), 'utf8'),
    );
    const sl = registry.sources.find((s) => s.id === 'skimlinks');
    assert.equal(sl.enabled.live, false);
    assert.equal(sl.enabled.sandbox, false);
    assert.ok(sl.rateLimit.maxConcurrency >= 1);
    assert.ok(sl.rateLimit.minIntervalMs >= 0);
  });

  it('skill pins FR-070 selftest section', () => {
    const text = fs.readFileSync(
      path.join(
        root,
        'providers/live/skimlinks/.grok/skills/a-search-skimlinks/SKILL.md',
      ),
      'utf8',
    );
    assert.match(text, /Selftest \+ pacing \(FR-070\)/);
    assert.match(text, /selftestProbe\.js/);
    assert.match(text, /rateLimit/);
  });
});

'use strict';

/**
 * MRB #5048 / FR #5047: hostile pins --- no-results sector feedback.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #5048 hostile FR #5047 no-results feedback', () => {
  it('agent path hooks recordNoResultsIfEmpty after promote (FR #5270)', () => {
    const done = fs.readFileSync(
      path.join(ROOT, 'shared', 'search', 'searchDone.js'),
      'utf8',
    );
    assert.doesNotMatch(done, /recordNoResultsIfEmpty/);
    assert.doesNotMatch(done, /promoteInToLive/);
    const agent = fs.readFileSync(
      path.join(ROOT, 'shared', 'widgets', 'promoteInToLive.js'),
      'utf8',
    );
    assert.match(agent, /recordNoResultsIfEmpty/);
    assert.match(agent, /runHasresultsAgentWork/);
  });

  it('changeEvents excludes feedback/ and _ops/', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'aClubs', 'changeEvents.js'),
      'utf8',
    );
    assert.match(src, /feedback/);
    assert.match(src, /_ops/);
  });

  it('docs pin ledger paths and never-widen', () => {
    const aff = fs.readFileSync(path.join(ROOT, 'docs', 'a-affiliates.md'), 'utf8');
    const mer = fs.readFileSync(path.join(ROOT, 'docs', 'a-merchants.md'), 'utf8');
    const ann = fs.readFileSync(
      path.join(ROOT, 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(aff, /need-vendors-by-sector\.json/);
    assert.match(mer, /need-vendors-by-sector\.json/);
    assert.match(ann, /never widen/i);
    assert.match(ann, /FR #5047|#5047/);
  });
});

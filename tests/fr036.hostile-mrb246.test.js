'use strict';

/** Hostile pins FR-036 / MRB #246 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('hostile MRB #246 FR-036', () => {
  it('synth template has queues+workers for amazon and ebay and SearchApiUrl', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const tpl = fs.readFileSync(path.join(r.outDir, 'ASearchStack.template.json'), 'utf8');
    assert.match(tpl, /a-search-amazon-live/);
    assert.match(tpl, /a-search-ebay-sandbox/);
    assert.match(tpl, /a-search-amazon-worker-live/);
    assert.match(tpl, /AWS::Lambda::EventSourceMapping/);
    assert.match(tpl, /SearchApiUrl/);
  });
});

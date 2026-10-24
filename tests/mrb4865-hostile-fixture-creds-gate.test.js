'use strict';

/**
 * MRB #4865 hostile: each FR #4850-#4853 probe gates assert*Creds on httpRequest.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const FILES = [
  'providers/live/rakuten/src/selftestProbe.js',
  'providers/live/cj/src/selftestProbe.js',
  'providers/live/kelkoo/src/selftestProbe.js',
  'providers/local/skimlinks/src/selftestProbe.js',
];

describe('MRB #4865 hostile fixture creds gate', () => {
  it('every listed probe requires liveHttp before assert*Creds', () => {
    for (const rel of FILES) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(text, /liveHttp/, rel);
      assert.match(text, /httpRequest/, rel);
      const assertAt = text.search(/assert\w+Creds\(/);
      const liveAt = text.indexOf('liveHttp');
      assert.ok(liveAt >= 0 && assertAt > liveAt, rel + ' assert before liveHttp gate');
    }
  });

  it('docs name FR #4850-#4853 and keep intake-on-fail CAST IRON', () => {
    const doc = fs.readFileSync(
      path.join(root, 'docs', 'endpoint-selftest.md'),
      'utf8',
    );
    assert.match(doc, /FR #4850/);
    assert.match(doc, /must not.*require vendor secrets/);
    assert.match(doc, /files intake/);
  });
});

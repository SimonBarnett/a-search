/**
 * MRB #4705 hostile pin: affiliate-agent tip must stay ASCII (no U+2014/U+2013)
 * so FR #4208 docs/a-affiliates.md check stays green.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DASH = /\u2014|\u2013/;

const paths = [
  'docs/a-affiliates.md',
  'redqueen/affiliate-agent/AGENTS.md',
  'redqueen/affiliate-agent/README.md',
  'redqueen/affiliate-agent/seed/a-affiliates/rakuten/AGENT.md',
  'redqueen/affiliate-agent/src/run.js',
  'redqueen/affiliate-agent/src/rakuten/run.js',
  'tools/agent.ps1',
];

describe('MRB #4705 affiliate-agent ASCII + no SQL feed keys in rakuten seed', () => {
  it('fail-when: tip docs/js/ps1 contain em/en dash', () => {
    for (const rel of paths) {
      const t = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.doesNotMatch(t, DASH, rel);
    }
  });

  it('fail-when: rakuten seed AGENT invents feedurl/format/schedule SQL layout', () => {
    const t = fs.readFileSync(
      path.join(root, 'redqueen/affiliate-agent/seed/a-affiliates/rakuten/AGENT.md'),
      'utf8',
    );
    assert.doesNotMatch(t, /\bfeedurl\b/i);
    assert.match(t, /_applications/);
    assert.match(t, /hobby|RC|model flying/i);
  });
});

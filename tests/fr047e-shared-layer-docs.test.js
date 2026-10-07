'use strict';

/** FR-047e: docs/shared-layer.md + README link */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-047e docs/shared-layer.md', () => {
  it('docs/shared-layer.md lists shared/ and Lambda /opt path', () => {
    const doc = path.join(root, 'docs', 'shared-layer.md');
    assert.ok(fs.existsSync(doc));
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /shared\//);
    assert.match(text, /\/opt\/nodejs\/a-search/);
    assert.match(text, /@a-search\/shared/);
    assert.match(text, /resultsPath|writeResults|assertEnv|buildTrackedUrl/);
  });

  it('root README links to docs/shared-layer.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/shared-layer\.md/);
  });
});

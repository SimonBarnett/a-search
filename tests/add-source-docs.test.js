'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const addSource = path.join(root, 'docs', 'add-source.md');
const readme = path.join(root, 'README.md');

describe('FR-025 docs/add-source.md checklist', () => {
  it('file exists', () => {
    assert.ok(fs.existsSync(addSource), 'docs/add-source.md must exist');
  });

  it('mentions registry enabled and no entry/ core edits', () => {
    const text = fs.readFileSync(addSource, 'utf8');
    assert.match(text, /registry/i);
    assert.match(text, /enabled/);
    assert.match(text, /entry\//);
    assert.match(text, /no(?:t)?\s+edit|without editing|Do not edit/i);
  });

  it('README links to docs/add-source.md', () => {
    const text = fs.readFileSync(readme, 'utf8');
    assert.match(text, /docs\/add-source\.md/);
  });
});

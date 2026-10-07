'use strict';

/** Hostile pins for MRB a-search#87 / FR-030 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const amazon = path.join(root, 'providers', 'live', 'amazon');

describe('MRB #87 hostile: FR-030 amazon PA-API', () => {
  it('docs/mrb-87.md pins creds-before-HTTP and fixture path', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'mrb-87.md'), 'utf8');
    assert.match(text, /amazon_missing_credentials/);
    assert.match(text, /search-items-ok\.json/);
    assert.match(text, /writeResults|putObject/);
  });

  it('fixture and search module exist; no live secret literals in fixture', () => {
    const fixture = path.join(amazon, 'fixtures', 'search-items-ok.json');
    assert.ok(fs.existsSync(fixture));
    const raw = fs.readFileSync(fixture, 'utf8');
    assert.doesNotMatch(raw, /AKIA[0-9A-Z]{16}/);
    assert.ok(fs.existsSync(path.join(amazon, 'src', 'search.js')));
    assert.ok(fs.existsSync(path.join(amazon, 'src', 'normalize.js')));
  });
});

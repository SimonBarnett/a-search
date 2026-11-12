'use strict';

/**
 * FR #5322: docs/provider-shortlist.md example + table match providers/registry.json
 * for wix.enabled and skimlinks kind/folder. No registry edits.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHORTLIST = path.join(ROOT, 'docs', 'provider-shortlist.md');
const REGISTRY = path.join(ROOT, 'providers', 'registry.json');

function utf8NoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.notEqual(buf[0], 0xef, `${filePath} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

function exampleSourcesFromShortlist(md) {
  const m = md.match(
    /## Example `providers\/registry\.json`\s+```json\s+([\s\S]*?)```/,
  );
  assert.ok(m, 'shortlist missing Example providers/registry.json fenced JSON');
  const parsed = JSON.parse(m[1]);
  assert.ok(Array.isArray(parsed.sources), 'example JSON sources[]');
  return new Map(parsed.sources.map((s) => [s.id, s]));
}

describe('FR #5322 provider-shortlist matches registry (wix + skimlinks)', () => {
  it('example JSON wix.enabled and skimlinks kind/folder match registry', () => {
    const md = utf8NoBom(SHORTLIST);
    const registry = JSON.parse(utf8NoBom(REGISTRY));
    const regById = new Map(registry.sources.map((s) => [s.id, s]));
    const exById = exampleSourcesFromShortlist(md);

    const regWix = regById.get('wix');
    const exWix = exById.get('wix');
    assert.ok(regWix, 'registry missing wix');
    assert.ok(exWix, 'example missing wix');
    assert.equal(exWix.enabled.live, true, 'example wix.live');
    assert.equal(exWix.enabled.sandbox, true, 'example wix.sandbox');
    assert.equal(exWix.enabled.live, regWix.enabled.live);
    assert.equal(exWix.enabled.sandbox, regWix.enabled.sandbox);

    const regSk = regById.get('skimlinks');
    const exSk = exById.get('skimlinks');
    assert.ok(regSk, 'registry missing skimlinks');
    assert.ok(exSk, 'example missing skimlinks');
    assert.equal(exSk.kind, 'local', 'example skimlinks.kind');
    assert.equal(exSk.folder, 'providers/local/skimlinks', 'example skimlinks.folder');
    assert.equal(exSk.kind, regSk.kind);
    assert.equal(exSk.folder, regSk.folder);
  });

  it('candidates table calls skimlinks kind local', () => {
    const md = utf8NoBom(SHORTLIST);
    assert.match(
      md,
      /\|\s*`skimlinks`\s*\|\s*local\s*\|/,
      'shortlist table must list skimlinks as local',
    );
    assert.doesNotMatch(
      md,
      /\|\s*`skimlinks`\s*\|\s*live\s*\|/,
      'shortlist table must not list skimlinks as live',
    );
  });
});

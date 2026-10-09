'use strict';

/**
 * FR-139: GitHub Actions CI — Node 20, npm ci, npm test, npm run synth.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'ci.yml');

describe('FR-139 GitHub Actions CI workflow', () => {
  it('ci.yml exists with Node 20 + npm ci + npm test + npm run synth on main', () => {
    assert.ok(fs.existsSync(workflowPath), '.github/workflows/ci.yml required');
    const text = fs.readFileSync(workflowPath, 'utf8');

    assert.match(text, /\bon:\s*\n/, 'workflow must declare on:');
    assert.match(text, /push:/);
    assert.match(text, /pull_request:/);
    assert.match(text, /branches:\s*\[[^\]]*main[^\]]*\]/);

    assert.match(text, /node-version:\s*['"]?20['"]?/);
    assert.match(text, /setup-node@/);
    assert.match(text, /actions\/checkout@/);

    assert.match(text, /\bnpm ci\b/);
    assert.match(text, /\bnpm test\b/);
    assert.match(text, /npm run synth/);

    // Must not skip synth or pin an ancient Node
    assert.doesNotMatch(text, /node-version:\s*['"]?(?:12|14|16|18)['"]?/);
    assert.doesNotMatch(text, /npm test\s*\|\|\s*true/);
  });

  it('FR-139 docs Decision LOCKED + release-gap CI Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-139.md'), 'utf8');
    assert.match(fr, /Decision|LOCKED/i);
    assert.match(fr, /ci\.yml|workflows\/ci/i);
    assert.match(fr, /Node\s*20|node-version/i);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\.github\/workflows/);
    assert.match(
      gap,
      /\.github\/workflows[^\n]*\*\*Yes\*\*|CI[^\n]*\*\*Yes\*\*[^\n]*S4/i,
    );
  });
});

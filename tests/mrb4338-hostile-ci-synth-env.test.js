'use strict';

/**
 * MRB #4338: CI runs `npm run synth`, which does not use the in-process
 * providerEnvRoot context. Without the fixture root, synth looks for
 * gitignored providers/live/{amazon,ebay}/.env and the vision S4 gate fails.
 * Deploy must still omit that context so a real deploy reads the gitignored files.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #4338 CI synth uses provider env fixtures', () => {
  it('npm run synth passes the fixture root and deploy does not', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.synth, /providerEnvRoot=tests\/fixtures\/provider-env/);
    assert.doesNotMatch(pkg.scripts.deploy, /providerEnvRoot/);
    assert.ok(fs.existsSync(path.join(root, 'tests', 'fixtures', 'provider-env', 'amazon.env')));
    assert.ok(fs.existsSync(path.join(root, 'tests', 'fixtures', 'provider-env', 'ebay.env')));
  });
});

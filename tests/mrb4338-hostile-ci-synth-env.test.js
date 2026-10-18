'use strict';

/**
 * MRB #4338: CI runs `npm run synth`, which does not use the in-process
 * providerEnvRoot context. Without the fixture root, synth looks for
 * gitignored providers/live/{amazon,ebay}/.env and the vision S4 gate fails.
 * Deploy must still omit that context so a real deploy reads the gitignored files.
 * Custom in-process cdk.App synths (fr153/155/156/157/191) must also pin the
 * fixture root or CI fails the same way.
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

  it('custom App synth contexts pin providerEnvRoot fixtures (FR #4336 CI)', () => {
    const files = [
      'tests/fr153-api-cors-allowlist.test.js',
      'tests/fr155-cost-tags.test.js',
      'tests/fr156-stage-suffix.test.js',
      'tests/fr157-api-access-logs-throttle.test.js',
      'tests/fr191-second-region-stack.test.js',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(
        src,
        /providerEnvRoot:\s*path\.join\(root,\s*'tests',\s*'fixtures',\s*'provider-env'\)/,
        rel + ' must pin providerEnvRoot fixtures for in-process synth',
      );
    }
  });
});

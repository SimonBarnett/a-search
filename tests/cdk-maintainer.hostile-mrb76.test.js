'use strict';

/**
 * MRB #76 hostile: FR-024 maintainer schedules — superseded by FR-3949.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('MRB #76 hostile: FR-024 maintainer schedules (removed FR-3949)', () => {
  it('stack drops maintainer Lambdas; schedule.js asset source still exists', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.doesNotMatch(text, /a-search-maintainer-live/);
    assert.doesNotMatch(text, /a-search-maintainer-sandbox/);
    assert.doesNotMatch(text, /maintainerHandlerPath\s*\(/);
    assert.doesNotMatch(text, /Duration\.minutes\(15\)/);
    assert.ok(
      fs.existsSync(path.join(root, 'maintainer', 'src', 'schedule.js')),
      'maintainer/src/schedule.js',
    );
  });

  it('synth template has no maintainer names', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      assert.match(String(err && err.message), /Cannot find module|aws-cdk-lib/);
      return;
    }
    void cdk;
    const { outDir } = ensureDefaultStackSynth(root);
    const tpl = fs.readFileSync(
      path.join(outDir, 'ASearchStack.template.json'),
      'utf8',
    );
    assert.doesNotMatch(tpl, /a-search-maintainer-live/);
    assert.doesNotMatch(tpl, /a-search-maintainer-sandbox/);
  });
});

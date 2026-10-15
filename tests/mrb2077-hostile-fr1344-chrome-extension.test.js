'use strict';

/**
 * MRB #2077 docs/hostile: #1344 Chrome extension MV3 gate + account/widget APIs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { shouldInjectTopBar } = require('../shared/extension/gate');
const { findJwtStorageViolations } = require('../shared/extension/jwtPolicy');

describe('MRB #2077 hostile FR-1344 chrome extension', () => {
  it('Decision LOCKED; Club TXT gate; JWT session-only; APIs wired; packs', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-1344.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /chrome\.storage\.session/);
    assert.match(fr, /402/);
    assert.match(fr, /upgrade_required/);

    assert.equal(
      shouldInjectTopBar({ enabled: true, clubId: 'club-1' }),
      true,
    );
    assert.equal(
      shouldInjectTopBar({ enabled: true, clubId: null }),
      false,
    );

    const bg = fs.readFileSync(
      path.join(ROOT, 'extension', 'background.js'),
      'utf8',
    );
    const content = fs.readFileSync(
      path.join(ROOT, 'extension', 'content.js'),
      'utf8',
    );
    assert.deepEqual(findJwtStorageViolations(bg), []);
    assert.deepEqual(findJwtStorageViolations(content), []);
    assert.match(bg, /chrome\.storage\.session/);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.manifest_version, 3);

    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /handleAccountCommission/);
    assert.match(index, /handleAccountUpgrade/);
    assert.match(index, /handleWidgetsMutate/);
    assert.match(index, /handleOAuthCallback/);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('extension/'));
    assert.ok(pkg.files.includes('account/'));
  });
});
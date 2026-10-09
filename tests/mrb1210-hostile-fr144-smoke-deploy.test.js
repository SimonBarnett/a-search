'use strict';

/**
 * MRB #1210 hostile pin: FR-144 post-deploy smoke script needles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'smoke-deploy.js');
const PIN = path.join(ROOT, 'tests', 'fr144-smoke-deploy.test.js');
const DEPLOY = path.join(ROOT, 'docs', 'deploy.md');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-144.md');
const GAP = path.join(ROOT, 'docs', 'release-gap-aws-installable-2026-10-09.md');
const PKG = path.join(ROOT, 'package.json');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1210.md');

function readUtf8NoBom(p) {
  const raw = fs.readFileSync(p);
  assert.notEqual(raw[0], 0xef, path.basename(p) + ' must be UTF-8 without BOM');
  for (let i = 0; i < raw.length; i++) {
    assert.ok(raw[i] < 128, path.basename(p) + ' must stay ASCII (byte ' + raw[i] + ' at ' + i + ')');
  }
  return raw.toString('utf8');
}

describe('MRB-1210 hostile FR-144 smoke-deploy', () => {
  it('smoke-deploy.js exports runSmoke and env knobs; no realistic JWT literal', () => {
    const text = readUtf8NoBom(SCRIPT);
    assert.match(text, /function runSmoke/);
    assert.ok(text.includes('A_SEARCH_API_URL'));
    assert.ok(text.includes('A_SEARCH_SMOKE_JWT'));
    assert.ok(text.includes('/search'));
    assert.ok(text.includes('/selftest'));
    assert.ok(text.includes('assertSearchAccept'));
    assert.ok(text.includes('assertSelftestShape'));
    assert.ok(text.includes('module.exports'));
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
  });

  it('fr144 pin + package smoke-deploy + Decision LOCKED + deploy section 7', () => {
    assert.ok(fs.existsSync(PIN), 'tests/fr144-smoke-deploy.test.js missing');
    const pin = readUtf8NoBom(PIN);
    assert.ok(pin.includes('runSmoke'));
    assert.ok(pin.includes('mockFetchSequence'));

    const pkg = JSON.parse(readUtf8NoBom(PKG));
    assert.equal(pkg.scripts['smoke-deploy'], 'node scripts/smoke-deploy.js');

    const fr = readUtf8NoBom(FR);
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.ok(fr.includes('smoke-deploy.js'));

    const deploy = readUtf8NoBom(DEPLOY);
    assert.ok(deploy.includes('## 7. Smoke (FR-144)'));
    assert.ok(deploy.includes('smoke-deploy.js'));
    assert.ok(
      deploy.includes('A_SEARCH_API_URL') || deploy.includes('A_SEARCH_SMOKE_JWT'),
    );
  });

  it('release-gap Post-deploy smoke Yes + docs/mrb-1210 board', () => {
    const gap = readUtf8NoBom(GAP);
    assert.match(gap, /\|\s*Post-deploy smoke\s*\|\s*\*\*Yes\*\*/);

    assert.ok(fs.existsSync(MRB_DOC), 'docs/mrb/mrb-1210.md missing');
    const board = readUtf8NoBom(MRB_DOC);
    assert.ok(board.includes('#1210'));
    assert.ok(board.includes('#980'));
    assert.ok(board.includes('FR-144'));
    assert.ok(board.includes('runSmoke'));
  });
});
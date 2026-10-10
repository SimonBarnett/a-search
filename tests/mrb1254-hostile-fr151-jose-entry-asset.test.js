'use strict';

/**
 * MRB #1254 hostile: FR-151 jose in package.json + stage-entry fail-closed copy.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function assertUtf8NoBomAscii(filePath, label) {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${label} must be UTF-8 without BOM`,
  );
  const text = buf.toString('utf8');
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII (hostile b<128)`,
  );
  return text;
}

describe('MRB-1254 FR-151 jose entry asset hostile', () => {
  it('package.json depends on jose; stage script fail-closed + required path', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.dependencies && pkg.dependencies.jose, 'jose in dependencies');
    const stage = fs.readFileSync(
      path.join(root, 'scripts', 'stage-entry-lambda-asset.js'),
      'utf8',
    );
    assert.match(stage, /FR-151/);
    assert.match(stage, /node_modules['"`\/\\]+jose|node_modules', 'jose'/);
    assert.match(stage, /missing node_modules\/jose|fail closed|throw new Error/i);
    assert.match(stage, /fr151/);
    assert.match(stage, /node_modules\/jose\/package\.json/);
  });

  it('FR-151 Decision LOCKED + release-gap pass2 Yes; entry jwt uses jose JWKS', () => {
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-151.md'),
      'docs/fr/FR-151.md',
    );
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr151-jose-entry-asset\.test\.js/);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /FR-151[\s\S]{0,80}Yes|jose[\s\S]{0,80}FR-151[\s\S]{0,40}Yes/i);
    const jwt = fs.readFileSync(path.join(root, 'entry', 'src', 'auth', 'jwt.js'), 'utf8');
    assert.match(jwt, /createRemoteJWKSet|require\(['\"]jose['\"]\)/);
    assert.match(jwt, /JWT_JWKS_URL/);
  });

  it('docs/mrb/mrb-1254.md cites product + #994', () => {
    const text = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'mrb', 'mrb-1254.md'),
      'docs/mrb/mrb-1254.md',
    );
    assert.match(text, /#1254|#994|FR-151/);
    assert.match(text, /jose/i);
  });
});

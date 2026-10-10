'use strict';

/**
 * FR-150: docs/secrets-matrix.md - Lambda x secret keys; no values; README pointer.
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

describe('FR-150 secrets matrix', () => {
  it('secrets-matrix.md covers entry JWT, provider, MSSQL local-only, S3', () => {
    const p = path.join(root, 'docs', 'secrets-matrix.md');
    const text = assertUtf8NoBomAscii(p, 'docs/secrets-matrix.md');
    assert.match(text, /FR-150/);
    assert.match(text, /a-search-entry/);
    assert.match(text, /JWT_ISSUER/);
    assert.match(text, /JWT_AUDIENCE/);
    assert.match(text, /JWT_JWKS_URL/);
    assert.match(text, /JWT_SECRET/);
    assert.match(text, /S3_RESULTS_BUCKET/);
    assert.match(text, /MSSQL_SERVER|MSSQL_\*/);
    assert.match(text, /maintainer/);
    assert.match(text, /onboarding/i);
    assert.match(text, /amazon/);
    assert.match(text, /awin/);
    assert.match(text, /impact/);
    assert.match(text, /Stay-dark|stay-dark/i);
    assert.match(text, /No secret values|no secret values/i);
    // JWT is wired (FR-136 Yes) - stale "open FR-136" must not remain
    assert.doesNotMatch(text, /open FR-136/i);
    assert.doesNotMatch(text, /\|\s*`JWT_\*`[^\n]*\|\s*\*\*No\*\*/);
    // No hunter-style secret literals
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9\-_]{20,}/);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
    assert.doesNotMatch(text, /password\s*=\s*['\"][^'\"]+['\"]/i);
  });

  it('README Docs list points at secrets-matrix (FR-150)', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /secrets-matrix\.md/);
    assert.match(readme, /FR-150/);
  });

  it('FR-150 Decision LOCKED + pin path', () => {
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-150.md'),
      'docs/fr/FR-150.md',
    );
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr150-secrets-matrix\.test\.js/);
  });

  it('release-installable still cites secrets-matrix', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'release-installable.md'),
      'utf8',
    );
    assert.match(text, /secrets-matrix\.md/);
    assert.match(text, /FR-150/);
  });
});

'use strict';

/** FR-123: JWT issuer / audience / JWKS deploy documentation (keys LOCKED; values out of git) */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('FR-123 JWT deploy docs', () => {
  it('endpoint-search.md locks env key names + deploy procedure + fail-closed', () => {
    const text = read('docs/endpoint-search.md');
    assert.match(text, /## JWT deploy config \(FR-123\)/);
    assert.match(text, /JWT_ISSUER/);
    assert.match(text, /JWT_AUDIENCE/);
    assert.match(text, /JWT_JWKS_URL/);
    assert.match(text, /JWT_SECRET|JWT_HS256_SECRET/);
    assert.match(text, /fail[- ]closed|unauthorized/i);
    assert.match(text, /secret store|deploy/i);
    assert.match(text, /never[\s\S]{0,40}git/i);
    // Values stay out of git; procedure LOCKED (not a bare UNKNOWN one-liner).
    assert.doesNotMatch(
      text,
      /JWT_ISSUER[\s\S]{0,120}values UNKNOWN until deploy/i,
    );
  });

  it('performance and selftest point at FR-123 deploy section', () => {
    for (const rel of [
      'docs/endpoint-performance.md',
      'docs/endpoint-selftest.md',
    ]) {
      const text = read(rel);
      assert.match(text, /JWT_ISSUER/);
      assert.match(text, /FR-123|endpoint-search\.md/i);
      assert.doesNotMatch(
        text,
        /JWT_ISSUER[\s\S]{0,120}values UNKNOWN until deploy/i,
      );
    }
  });

  it('entry/.env.example has placeholders only (no real secrets)', () => {
    const text = read('entry/.env.example');
    assert.match(text, /^JWT_ISSUER=/m);
    assert.match(text, /^JWT_AUDIENCE=/m);
    assert.match(text, /^JWT_JWKS_URL=/m);
    assert.match(text, /^JWT_SECRET=\s*$/m);
    assert.match(text, /example\.invalid|FR-123|placeholder/i);
    assert.doesNotMatch(text, /JWT_SECRET=\S+/);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/); // raw JWT
  });

  it('vision notes JWT key names LOCKED / values deploy-time', () => {
    const text = read('docs/vision.md');
    assert.match(text, /JWT_ISSUER|JWT deploy|FR-123/i);
  });
});

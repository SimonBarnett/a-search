'use strict';

/**
 * MRB #990 hostile pins for FR-123 JWT deploy docs (keys LOCKED; values out of git).
 * Additive to tests/fr123-jwt-deploy-docs.test.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB-990 FR-123 hostile', () => {
  it('endpoint-search.md: key table + fail-closed 401 + deploy procedure + never git secrets', () => {
    const text = read('docs/endpoint-search.md');
    assert.match(text, /## JWT deploy config \(FR-123\)/);
    assert.match(text, /\| `JWT_ISSUER`/);
    assert.match(text, /\| `JWT_AUDIENCE`/);
    assert.match(text, /\| `JWT_JWKS_URL`/);
    assert.match(text, /\| `JWT_SECRET`/);
    assert.match(text, /JWT_HS256_SECRET/);
    assert.match(text, /fail-closed/);
    assert.match(text, /\*\*401\*\*\s*`unauthorized`|401[\s\S]{0,40}unauthorized/i);
    assert.match(text, /Deploy procedure/i);
    assert.match(text, /Never[\s\S]{0,40}git/i);
  });

  it('entry/.env.example placeholders use example.invalid; JWT_SECRET empty', () => {
    const text = read('entry/.env.example');
    assert.match(text, /JWT_ISSUER=https:\/\/login\.example\.invalid\//);
    assert.match(text, /JWT_AUDIENCE=a-search/);
    assert.match(text, /JWT_JWKS_URL=https:\/\/login\.example\.invalid\/\.well-known\/jwks\.json/);
    assert.match(text, /^JWT_SECRET=\s*$/m);
    assert.doesNotMatch(text, /JWT_SECRET=\S+/);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('vision.md UNKNOWN: key names LOCKED FR-123; values deploy-time', () => {
    const text = read('docs/vision.md');
    assert.match(text, /FR-123/);
    assert.match(text, /key names LOCKED/i);
    assert.match(text, /endpoint-search\.md/);
  });

  it('product fr123 pin file present', () => {
    const pin = read('tests/fr123-jwt-deploy-docs.test.js');
    // Source uses regex literals with escapes — match the escaped form in the pin file.
    assert.match(pin, /JWT deploy config \\\(FR-123\\\)/);
    assert.match(pin, /JWT_SECRET=/);
    assert.match(pin, /example\\\.invalid/);
  });
});

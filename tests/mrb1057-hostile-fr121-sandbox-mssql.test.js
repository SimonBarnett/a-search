'use strict';

/**
 * MRB #1057 hostile pins for FR-121 sandbox MSSQL separate-DB lock.
 * Additive to tests/fr121-sandbox-mssql-decision.test.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB-1057 FR-121 hostile', () => {
  it('environments.md: Chosen option (1) + Rejected (2)/(3) + placeholder sandbox name', () => {
    const text = read('docs/environments.md');
    assert.match(text, /LOCKED \(FR-121\)/);
    assert.match(text, /Chosen option[\s\S]{0,80}separate database on the same instance/i);
    assert.match(text, /Rejected[\s\S]{0,80}schema inside `madeiradb`/i);
    assert.match(text, /Rejected[\s\S]{0,120}live read-only/i);
    assert.match(text, /<sandbox-mssql-database>/);
    assert.match(text, /Fail-closed/);
    assert.doesNotMatch(text, /MSSQL_DATABASE=a_search_sandbox/);
  });

  it('vision.md LOCKED FR-121 separate database; not open UNKNOWN', () => {
    const text = read('docs/vision.md');
    assert.match(text, /LOCKED \(FR-121\)/);
    assert.match(text, /separate database on the same instance/i);
  });

  it('maintainer/.env.example comments FR-121 sandbox separate DB', () => {
    const text = read('maintainer/.env.example');
    assert.match(text, /FR-121/);
    assert.match(text, /separate DB|separate database/i);
    assert.match(text, /^MSSQL_DATABASE=madeiradb$/m);
  });

  it('product fr121 pin file present', () => {
    const pin = read('tests/fr121-sandbox-mssql-decision.test.js');
    assert.match(pin, /separate database on the same instance/i);
    assert.match(pin, /a_search_sandbox/);
    assert.match(pin, /FR-121/);
  });
});

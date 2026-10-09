'use strict';

/** FR-121: sandbox MSSQL isolation LOCKED = separate database on same instance */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('FR-121 sandbox MSSQL decision', () => {
  it('environments.md locks separate DB on same instance; rejects (2)/(3) as chosen', () => {
    const text = read('docs/environments.md');
    assert.match(text, /## MSSQL target \(FR-119\)/);
    assert.match(text, /Sandbox[\s\S]{0,80}LOCKED|LOCKED[\s\S]{0,80}Sandbox/i);
    assert.match(text, /FR-121/);
    assert.match(text, /separate database on the same instance/i);
    assert.match(text, /madeiradb/);
    assert.match(text, /WIN-MPRE8VI4U6U/);
    // Isolation table sandbox column no longer bare UNKNOWN.
    assert.match(
      text,
      /\| MSSQL \|[\s\S]{0,120}madeiradb[\s\S]{0,200}separate/i,
    );
    assert.doesNotMatch(
      text,
      /\*\*Sandbox\*\*[\s\S]{0,80}\*\*UNKNOWN\*\* until Simon decides/i,
    );
    // Options (2) and (3) must not be presented as the chosen sandbox target.
    assert.match(text, /Rejected[\s\S]{0,80}schema inside `madeiradb`/i);
    assert.match(text, /Rejected[\s\S]{0,120}live read-only/i);
    // Fail-closed / ops notes.
    assert.match(text, /RECOVERY SIMPLE|SIMPLE/i);
    assert.match(text, /ops/i);
  });

  it('does not invent a_search_sandbox as a committed real database name', () => {
    const text = read('docs/environments.md');
    assert.doesNotMatch(text, /MSSQL_DATABASE=a_search_sandbox/);
    // Placeholder form is OK; literal invented name as the locked DB is not.
    assert.doesNotMatch(
      text,
      /Sandbox database name:\s*`a_search_sandbox`/i,
    );
    for (const envPath of walkEnvExamples(root)) {
      const env = fs.readFileSync(envPath, 'utf8');
      assert.doesNotMatch(
        env,
        /MSSQL_DATABASE=a_search_sandbox/,
        path.relative(root, envPath),
      );
    }
  });

  it('vision UNKNOWN no longer lists sandbox MSSQL isolation as open', () => {
    const text = read('docs/vision.md');
    assert.match(text, /FR-121|separate database/i);
    assert.doesNotMatch(
      text,
      /sandbox MSSQL[\s\S]{0,40}UNKNOWN|UNKNOWN[\s\S]{0,40}sandbox (DB|database|MSSQL)/i,
    );
  });

  it('FR-121 park mirror still records LOCKED option (1)', () => {
    const text = read('docs/fr/FR-121.md');
    assert.match(text, /Decision \(LOCKED 2026-10-09\)/);
    assert.match(text, /separate database on the same instance/i);
  });
});

function walkEnvExamples(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkEnvExamples(p));
    else if (ent.name === '.env.example') out.push(p);
  }
  return out;
}

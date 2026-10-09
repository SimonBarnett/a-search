'use strict';

/**
 * MRB #921 hostile pins for FR-119 MSSQL target + connect error codes.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  classifyMssqlConnectError,
} = require('../shared/mssql/classifyConnectError');

function walkEnvExamples(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkEnvExamples(p));
    else if (ent.name === '.env.example') out.push(p);
  }
  return out;
}

describe('MRB-921 FR-119 hostile', () => {
  it('environments.md: live madeiradb host, sandbox FR-121 separate DB, network PENDING, least-privilege, SIMPLE', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    assert.match(text, /## MSSQL target \(FR-119\)/);
    assert.match(text, /WIN-MPRE8VI4U6U/);
    assert.match(text, /madeiradb/);
    assert.match(text, /FR-121/);
    assert.match(text, /separate database on the same instance/i);
    // FR-122: decision surface; chosen option may still be PENDING/UNKNOWN.
    assert.match(text, /## Network path \(FR-122\)/);
    assert.match(text, /Chosen option[\s\S]{0,120}(PENDING|UNKNOWN)/i);
    assert.match(text, /Least-privilege/i);
    assert.match(text, /SIMPLE/);
    // FR #1280 / FR-146: recommended name OK when Treat-as-missing (not a deny-only pin).
    assert.match(text, /Recommended[\s\S]{0,120}a_search_sandbox/i);
    assert.match(text, /Treat as missing|do not invent credentials/i);
    assert.doesNotMatch(text, /MSSQL_DATABASE=a_search_sandbox/);
    assert.match(text, /MSSQL_SERVER/);
    assert.match(text, /<ionos-sql-host>/);
  });

  it('.env.example placeholders: ionos-sql-host + madeiradb; empty password; no a_search_sandbox', () => {
    let checked = 0;
    for (const envPath of walkEnvExamples(root)) {
      const text = fs.readFileSync(envPath, 'utf8');
      assert.doesNotMatch(text, /a_search_sandbox/);
      if (/MSSQL_SERVER\s*=/.test(text)) {
        checked += 1;
        assert.match(text, /MSSQL_SERVER=<ionos-sql-host>/);
        assert.match(text, /MSSQL_DATABASE=madeiradb/);
        assert.doesNotMatch(text, /MSSQL_PASSWORD=[^\s\n]+/);
        assert.match(text, /MSSQL_ENCRYPT/);
        assert.match(text, /MSSQL_TRUST_SERVER_CERTIFICATE/);
      }
    }
    assert.ok(checked >= 10, 'expected many local provider env examples, got ' + checked);
  });

  it('classifyMssqlConnectError splits auth vs unreachable', () => {
    assert.equal(
      classifyMssqlConnectError({ code: 'ELOGIN', message: 'Login failed' }),
      'mssql_auth_failed',
    );
    assert.equal(
      classifyMssqlConnectError({ number: 18456, message: 'Login failed for user' }),
      'mssql_auth_failed',
    );
    assert.equal(
      classifyMssqlConnectError({ code: 'ESOCKET', message: 'Failed to connect' }),
      'mssql_unreachable',
    );
    assert.equal(
      classifyMssqlConnectError({ code: 'ETIMEOUT', message: 'Timeout' }),
      'mssql_unreachable',
    );
  });

  it('local selftest probes import classifier / mssql_unreachable', () => {
    const probes = [
      'awin',
      'impact',
      'partnerize',
      'webgains',
      'woocommerce',
    ];
    for (const id of probes) {
      const p = path.join(root, 'providers', 'local', id, 'src', 'selftestProbe.js');
      const text = fs.readFileSync(p, 'utf8');
      assert.match(text, /classifyMssqlConnectError|mssql_unreachable/, id);
    }
  });
});

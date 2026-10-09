'use strict';

/** FR-119: MSSQL target madeiradb on WIN-MPRE8VI4U6U + selftest error codes */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  classifyMssqlConnectError,
} = require('../shared/mssql/classifyConnectError');

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

describe('FR-119 docs/environments.md MSSQL target', () => {
  it('names WIN-MPRE8VI4U6U / madeiradb for live; sandbox LOCKED separate DB (FR-121)', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    assert.match(text, /WIN-MPRE8VI4U6U/);
    assert.match(text, /madeiradb/);
    assert.match(text, /## MSSQL target \(FR-119\)/);
    // FR-121 locked sandbox = separate database on the same instance.
    assert.match(text, /FR-121/);
    assert.match(text, /separate database on the same instance/i);
    // FR-122 expanded the bare UNKNOWN one-liner into a decision surface;
    // chosen option may still be PENDING/UNKNOWN until ops locks A/B/C.
    assert.match(text, /## Network path \(FR-122\)/);
    assert.match(
      text,
      /Chosen option[\s\S]{0,120}(PENDING|UNKNOWN)/i,
    );
    assert.match(text, /Least-privilege/i);
    assert.match(text, /SELECT/);
    assert.match(text, /SIMPLE/);
    assert.match(text, /MSSQL_ENCRYPT/);
    assert.match(text, /MSSQL_TRUST_SERVER_CERTIFICATE/);
    assert.doesNotMatch(text, /\bor live DB\b/i);
  });

  it('docs and .env.example never treat a_search_sandbox as real', () => {
    const docsDir = path.join(root, 'docs');
    for (const ent of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
      const text = fs.readFileSync(path.join(docsDir, ent.name), 'utf8');
      if (ent.name === 'environments.md') {
        // may mention the name only to deny it exists
        assert.match(text, /no[\s\S]{0,40}a_search_sandbox/i);
        assert.doesNotMatch(text, /MSSQL_DATABASE=a_search_sandbox/);
        continue;
      }
      assert.doesNotMatch(
        text,
        /a_search_sandbox/,
        `docs/${ent.name} still names a_search_sandbox`,
      );
    }
    for (const envPath of walkEnvExamples(root)) {
      const text = fs.readFileSync(envPath, 'utf8');
      assert.doesNotMatch(
        text,
        /a_search_sandbox/,
        `${path.relative(root, envPath)} still names a_search_sandbox`,
      );
      if (/MSSQL_SERVER\s*=/.test(text)) {
        assert.match(
          text,
          /MSSQL_SERVER=<ionos-sql-host>/,
          `${path.relative(root, envPath)} missing <ionos-sql-host>`,
        );
        assert.match(
          text,
          /MSSQL_DATABASE=madeiradb/,
          `${path.relative(root, envPath)} missing madeiradb`,
        );
        assert.match(text, /MSSQL_ENCRYPT/);
        assert.match(text, /MSSQL_TRUST_SERVER_CERTIFICATE/);
        assert.doesNotMatch(
          text,
          /MSSQL_PASSWORD=[^\s\n]+/,
          `${path.relative(root, envPath)} has non-empty MSSQL_PASSWORD`,
        );
      }
    }
  });
});

describe('FR-119 classifyMssqlConnectError', () => {
  it('maps auth failures to mssql_auth_failed', () => {
    assert.equal(
      classifyMssqlConnectError({ code: 'ELOGIN', message: 'Login failed' }),
      'mssql_auth_failed',
    );
    assert.equal(
      classifyMssqlConnectError({
        number: 18456,
        message: 'Login failed for user',
      }),
      'mssql_auth_failed',
    );
    assert.equal(
      classifyMssqlConnectError(new Error("Login failed for user x")),
      'mssql_auth_failed',
    );
  });

  it('maps network/host errors to mssql_unreachable', () => {
    assert.equal(
      classifyMssqlConnectError(new Error('ECONNREFUSED')),
      'mssql_unreachable',
    );
    assert.equal(
      classifyMssqlConnectError({
        code: 'ETIMEOUT',
        message: 'Failed to connect',
      }),
      'mssql_unreachable',
    );
  });
});

describe('FR-119 local selftest probes use classified codes', () => {
  it('awin probe returns mssql_unreachable / mssql_auth_failed', async () => {
    const {
      probeAwinSelftest,
    } = require('../providers/local/awin/src/selftestProbe');
    const base = {
      A_SEARCH_ENV: 'sandbox',
      MSSQL_SERVER: 'sql.test',
      MSSQL_DATABASE: 'madeiradb',
      MSSQL_USER: 'app',
      MSSQL_PASSWORD: 'x',
    };
    const unreachable = await probeAwinSelftest({
      env: base,
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(unreachable.ok, false);
    assert.equal(unreachable.error, 'mssql_unreachable');

    const auth = await probeAwinSelftest({
      env: base,
      connect: async () => {
        const err = new Error('Login failed for user app');
        /** @type {any} */ (err).number = 18456;
        throw err;
      },
    });
    assert.equal(auth.ok, false);
    assert.equal(auth.error, 'mssql_auth_failed');
  });

  it('every local selftestProbe.js references classifyMssqlConnectError', () => {
    const local = path.join(root, 'providers', 'local');
    for (const id of fs.readdirSync(local, { withFileTypes: true })) {
      if (!id.isDirectory()) continue;
      const probe = path.join(local, id.name, 'src', 'selftestProbe.js');
      if (!fs.existsSync(probe)) continue;
      const text = fs.readFileSync(probe, 'utf8');
      assert.match(
        text,
        /classifyMssqlConnectError/,
        `${id.name} selftestProbe missing classifyMssqlConnectError`,
      );
    }
  });
});

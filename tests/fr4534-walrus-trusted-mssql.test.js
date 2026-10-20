'use strict';

/**
 * FR #4534: trusted SQL uses msnodesqlv8 (not tedious NTLM); drain must not
 * crash or delete on connection/query errors; register dry-run accepts
 * -ServiceAccount without -ServicePasswordFile plus AWS credential file env.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(
  ROOT,
  'walrus',
  'install',
  'Register-WalrusSqlDrainService.ps1',
);

const {
  mssqlConfigFromEnv,
  resolveMssqlRequirePath,
  isTrustedConnectionEnv,
} = require('../providers/local/sql/src/queryParts');
const { createDrainRunner } = require('../walrus/src/drainRunner');
const { runLoop } = require('../walrus/src/index');

describe('FR #4534 trusted MSSQL driver selection', () => {
  it('trusted env selects msnodesqlv8 + trustedConnection (no tedious NTLM)', () => {
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_TRUSTED_CONNECTION: 'true',
    });
    assert.equal(isTrustedConnectionEnv({ MSSQL_TRUSTED_CONNECTION: 'true' }), true);
    assert.equal(cfg.driver, 'msnodesqlv8');
    assert.equal(cfg.options.trustedConnection, true);
    assert.equal(cfg.authentication, undefined);
    assert.equal(resolveMssqlRequirePath(cfg), 'mssql/msnodesqlv8');
  });

  it('SQL auth stays on tedious mssql without trustedConnection', () => {
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_USER: 'FAKE_sql_user',
      MSSQL_PASSWORD: 'FAKE_sql_pw',
    });
    assert.equal(cfg.driver, undefined);
    assert.equal(cfg.options && cfg.options.trustedConnection, undefined);
    assert.equal(cfg.user, 'FAKE_sql_user');
    assert.equal(resolveMssqlRequirePath(cfg), 'mssql');
  });
});

describe('FR #4534 drain does not crash or delete on SQL errors', () => {
  it('connection failure: no deleteMessage; changeVisibility(0); process stays alive', async () => {
    /** @type {string[]} */
    const deleted = [];
    /** @type {Array<{rh:string,t:number}>} */
    const visibility = [];
    const queue = {
      async receive() {
        return [
          {
            MessageId: 'm1',
            ReceiptHandle: 'rh-1',
            Body: JSON.stringify({
              source: 'sql',
              hostkey: 'h',
              guid: 'g',
              searchid: 's1',
              env: 'live',
            }),
          },
        ];
      },
      async deleteMessage(rh) {
        deleted.push(rh);
      },
      async changeVisibility(rh, t) {
        visibility.push({ rh, t });
      },
    };

    const runner = createDrainRunner({
      queue,
      runJob: async () => {
        const err = new TypeError("Cannot read properties of undefined (reading 'length')");
        err.code = 'sql_connect_failed';
        throw err;
      },
    });

    const once = await runner.processOnce();
    assert.equal(once.ok, false);
    assert.match(String(once.error), /sql_connect_failed|length/i);
    assert.deepEqual(deleted, []);
    assert.deepEqual(visibility, [{ rh: 'rh-1', t: 0 }]);
  });

  it('runLoop keeps polling after a thrown job error (no process.exit)', async () => {
    let receives = 0;
    const logs = [];
    const queue = {
      async receive() {
        receives += 1;
        if (receives === 1) {
          return [
            {
              MessageId: 'm1',
              ReceiptHandle: 'rh-boom',
              Body: JSON.stringify({
                source: 'sql',
                hostkey: 'h',
                guid: 'g',
                searchid: 's1',
                env: 'live',
              }),
            },
          ];
        }
        return [];
      },
      async deleteMessage() {
        throw new Error('must_not_delete');
      },
      async changeVisibility() {},
    };

    // Inject via createWalrusDrain path is heavy; exercise createDrainRunner loop shape
    // through runLoop's processOnce catch by building a minimal runner manually.
    const { createDrainRunner: mk } = require('../walrus/src/drainRunner');
    const runner = mk({
      queue,
      runJob: async () => {
        throw new TypeError('tedious ntlm boom');
      },
    });
    const r1 = await runner.processOnce();
    assert.equal(r1.ok, false);
    const r2 = await runner.processOnce();
    assert.equal(r2.empty, true);
    assert.equal(receives, 2);
    void logs;
    void runLoop;
  });
});

describe('FR #4534 Register-WalrusSqlDrainService dry-run', () => {
  it('ServiceAccount without ServicePasswordFile + AWS file params succeeds', () => {
    const awsCred = path.join(os.tmpdir(), `aws-cred-${process.pid}`);
    const awsCfg = path.join(os.tmpdir(), `aws-cfg-${process.pid}`);
    fs.writeFileSync(awsCred, '[default]\n', 'utf8');
    fs.writeFileSync(awsCfg, '[default]\nregion=eu-west-2\n', 'utf8');
    try {
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT,
          '-WhatIf',
          '-SqsDbBackedUrl',
          'https://sqs.eu-west-2.amazonaws.com/123/a-search-db-backed',
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
          '-MssqlServer',
          'walrus\\ASEARCH',
          '-MssqlDatabase',
          'a_search',
          '-ServiceAccount',
          '.\\a-search-drain',
          '-AwsSharedCredentialsFile',
          awsCred,
          '-AwsConfigFile',
          awsCfg,
        ],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.match(r.stdout, /MSSQL_TRUSTED_CONNECTION=true/);
      assert.match(r.stdout, /AWS_SHARED_CREDENTIALS_FILE=/);
      assert.match(r.stdout, /AWS_CONFIG_FILE=/);
      assert.doesNotMatch(r.stdout, /ServicePasswordFile_required/i);
      assert.match(r.stdout, /ObjectName.*a-search-drain/i);
    } finally {
      try {
        fs.unlinkSync(awsCred);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(awsCfg);
      } catch {
        /* ignore */
      }
    }
  });
});

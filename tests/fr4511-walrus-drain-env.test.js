'use strict';

/**
 * FR #4511: Register-WalrusSqlDrainService AppEnvironmentExtra must include
 * every env the drain reads; drain exits with a clear missing-config list and
 * never calls ReceiveMessage when any required var is missing.
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
  REQUIRED_DRAIN_ENV_KEYS,
  listMissingDrainEnv,
  assertDrainEnv,
  createWalrusDrain,
  main,
} = require('../walrus/src/index');

const FULL_ENV = {
  SQS_DB_BACKED_URL: 'https://sqs.eu-west-2.amazonaws.com/123/a-search-db-backed',
  A_CLUBS_ROOT: 'D:\\s3\\a-clubs',
  AWS_REGION: 'eu-west-2',
  AWS_PROFILE: 'a-search-walrus-sql-drain',
  A_SEARCH_ENV: 'live',
  MSSQL_SERVER: 'walrus\\ASEARCH',
  MSSQL_DATABASE: 'a_search',
  MSSQL_USER: 'FAKE_sql_user',
  MSSQL_PASSWORD: 'FAKE_sql_pw_fr4511',
};

describe('FR #4511 walrus drain env gate', () => {
  it('lists every missing required env and reports a clear message', () => {
    const missing = listMissingDrainEnv({});
    assert.ok(missing.includes('SQS_DB_BACKED_URL'));
    assert.ok(missing.includes('A_CLUBS_ROOT'));
    assert.ok(missing.includes('AWS_REGION'));
    assert.ok(missing.includes('MSSQL_SERVER'));
    assert.ok(missing.includes('MSSQL_DATABASE'));
    assert.ok(missing.includes('MSSQL_USER'));
    assert.ok(missing.includes('MSSQL_PASSWORD'));
    const gate = assertDrainEnv({});
    assert.equal(gate.ok, false);
    assert.match(gate.message, /missing config:/);
    assert.match(gate.message, /SQS_DB_BACKED_URL/);
  });

  it('trusted connection skips SQL user/password requirements', () => {
    const missing = listMissingDrainEnv({
      ...FULL_ENV,
      MSSQL_TRUSTED_CONNECTION: 'true',
      MSSQL_USER: undefined,
      MSSQL_PASSWORD: undefined,
    });
    assert.equal(missing.includes('MSSQL_USER'), false);
    assert.equal(missing.includes('MSSQL_PASSWORD'), false);
    assert.deepEqual(missing, []);
  });

  it('createWalrusDrain does not call createSqsClient when config is missing', () => {
    let created = 0;
    assert.throws(
      () =>
        createWalrusDrain({
          envVars: { MSSQL_DATABASE: 'a_search' },
          createSqsClient: () => {
            created += 1;
            return { send: async () => ({}) };
          },
        }),
      /missing config/,
    );
    assert.equal(created, 0);
  });

  it('main exits 2 before ReceiveMessage when config is missing', async () => {
    let receiveCalls = 0;
    let exitCode = null;
    const errors = [];
    const result = await main({
      envVars: {},
      createSqsClient: () => ({
        send: async (cmd) => {
          const name = cmd && (cmd.constructor && cmd.constructor.name);
          if (/ReceiveMessage/i.test(String(name)) || (cmd && cmd.input)) {
            receiveCalls += 1;
          }
          receiveCalls += 1;
          return { Messages: [] };
        },
      }),
      exit: (code) => {
        exitCode = code;
      },
      error: (line) => {
        errors.push(String(line));
      },
      run: async () => {
        receiveCalls += 100;
      },
    });
    assert.equal(result.exited, 2);
    assert.equal(exitCode, 2);
    assert.equal(receiveCalls, 0);
    assert.match(errors.join('\n'), /missing config:/);
  });

  it('full env passes the gate', () => {
    assert.deepEqual(listMissingDrainEnv(FULL_ENV), []);
    assert.equal(assertDrainEnv(FULL_ENV).ok, true);
  });
});

describe('FR #4511 Register-WalrusSqlDrainService AppEnvironmentExtra', () => {
  it('script declares the drain env params and masks secrets on DryRun', () => {
    const ps1 = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(ps1, /SqsDbBackedUrl/);
    assert.match(ps1, /AwsRegion/);
    assert.match(ps1, /MssqlServer/);
    assert.match(ps1, /MssqlPasswordFile/);
    assert.match(ps1, /ServiceAccount/);
    assert.match(ps1, /Format-EnvPairsForDisplay|MSSQL_PASSWORD=\*\*\*/);
    assert.match(ps1, /SQS_DB_BACKED_URL=/);
    assert.match(ps1, /MSSQL_SERVER=/);
    assert.match(ps1, /AWS_REGION=/);
    assert.match(ps1, /MSSQL_TRUSTED_CONNECTION/);
    for (const key of [
      'SQS_DB_BACKED_URL',
      'A_CLUBS_ROOT',
      'AWS_REGION',
      'MSSQL_SERVER',
      'MSSQL_DATABASE',
    ]) {
      assert.match(ps1, new RegExp(key));
    }
    assert.ok(REQUIRED_DRAIN_ENV_KEYS.includes('SQS_DB_BACKED_URL'));
  });

  it(
    'fake nssm AppEnvironmentExtra includes every env the drain reads',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4511-nssm-'));
      const installRoot = path.join(tmp, 'install');
      const indexJs = path.join(installRoot, 'walrus', 'src', 'index.js');
      fs.mkdirSync(path.dirname(indexJs), { recursive: true });
      fs.writeFileSync(indexJs, "'use strict';\n", 'utf8');

      const pwFile = path.join(tmp, 'sql.password');
      fs.writeFileSync(pwFile, 'FAKE_sql_pw_fr4511\n', 'utf8');

      const logPath = path.join(tmp, 'nssm-args.log');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      fs.writeFileSync(
        fakeNssm,
        [
          '@echo off',
          `>> "${logPath}" echo %*`,
          'exit /b 0',
          '',
        ].join('\r\n'),
        'utf8',
      );

      const svc = 'a-search-walrus-sql-drain-fr4511-test';
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT,
          '-InstallRoot',
          installRoot,
          '-ServiceName',
          svc,
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-SqsDbBackedUrl',
          FULL_ENV.SQS_DB_BACKED_URL,
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
          '-AwsRegion',
          'eu-west-2',
          '-MssqlServer',
          'walrus\\ASEARCH',
          '-MssqlDatabase',
          'a_search',
          '-MssqlUser',
          'FAKE_sql_user',
          '-MssqlPasswordFile',
          pwFile,
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.ok(fs.existsSync(logPath), 'fake nssm should have logged args');
      const log = fs.readFileSync(logPath, 'utf8');
      assert.match(log, /AppEnvironmentExtra/);
      for (const key of [
        'AWS_PROFILE=',
        'AWS_REGION=eu-west-2',
        'SQS_DB_BACKED_URL=',
        'A_CLUBS_ROOT=',
        'A_SEARCH_ENV=',
        'MSSQL_SERVER=',
        'MSSQL_DATABASE=a_search',
        'MSSQL_USER=FAKE_sql_user',
        'MSSQL_PASSWORD=',
      ]) {
        assert.match(log, new RegExp(key.replace(/\\/g, '\\\\')));
      }
      // Re-run keeps the full env (second AppEnvironmentExtra write).
      const r2 = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT,
          '-InstallRoot',
          installRoot,
          '-ServiceName',
          svc,
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-SqsDbBackedUrl',
          FULL_ENV.SQS_DB_BACKED_URL,
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
          '-AwsRegion',
          'eu-west-2',
          '-MssqlServer',
          'walrus\\ASEARCH',
          '-MssqlDatabase',
          'a_search',
          '-MssqlUser',
          'FAKE_sql_user',
          '-MssqlPasswordFile',
          pwFile,
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(r2.status, 0, `re-run stderr=${r2.stderr}\nstdout=${r2.stdout}`);
      const log2 = fs.readFileSync(logPath, 'utf8');
      const extraCount = (log2.match(/AppEnvironmentExtra/g) || []).length;
      assert.ok(extraCount >= 2, `expected >=2 AppEnvironmentExtra writes, got ${extraCount}`);

      const dry = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT,
          '-InstallRoot',
          installRoot,
          '-ServiceName',
          svc,
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-SqsDbBackedUrl',
          FULL_ENV.SQS_DB_BACKED_URL,
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
          '-AwsRegion',
          'eu-west-2',
          '-MssqlServer',
          'walrus\\ASEARCH',
          '-MssqlUser',
          'FAKE_sql_user',
          '-MssqlPasswordFile',
          pwFile,
          '-WhatIf',
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(dry.status, 0, `dry stderr=${dry.stderr}\nstdout=${dry.stdout}`);
      assert.match(dry.stdout || '', /MSSQL_PASSWORD=\*\*\*/);
      assert.doesNotMatch(dry.stdout || '', /FAKE_sql_pw_fr4511/);

      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  );
});

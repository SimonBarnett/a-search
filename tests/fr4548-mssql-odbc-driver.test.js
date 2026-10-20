'use strict';

/**
 * FR #4548: trusted msnodesqlv8 must use MSSQL_ODBC_DRIVER (default ODBC Driver 17)
 * or a full MSSQL_CONNECTION_STRING override — never the missing Native Client 11.0.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  DEFAULT_MSSQL_ODBC_DRIVER,
  mssqlOdbcDriverFromEnv,
  mssqlConnectionStringFromEnv,
  applyTrustedMssqlOdbc,
} = require('../shared/mssql/trustedOdbc');

const { mssqlConfigFromEnv } = require('../providers/local/sql/src/queryParts');
const { migratorConfigFromEnv } = require('../scripts/db-migrate');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(
  ROOT,
  'walrus',
  'install',
  'Register-WalrusSqlDrainService.ps1',
);

describe('FR #4548 shared trusted ODBC helper', () => {
  it('defaults MSSQL_ODBC_DRIVER to ODBC Driver 17 for SQL Server', () => {
    assert.equal(DEFAULT_MSSQL_ODBC_DRIVER, 'ODBC Driver 17 for SQL Server');
    assert.equal(mssqlOdbcDriverFromEnv({}), DEFAULT_MSSQL_ODBC_DRIVER);
    assert.equal(
      mssqlOdbcDriverFromEnv({ MSSQL_ODBC_DRIVER: '  ' }),
      DEFAULT_MSSQL_ODBC_DRIVER,
    );
    assert.equal(
      mssqlOdbcDriverFromEnv({ MSSQL_ODBC_DRIVER: 'ODBC Driver 18 for SQL Server' }),
      'ODBC Driver 18 for SQL Server',
    );
  });

  it('connection string override wins over built Driver= string', () => {
    const override = 'Driver={ODBC Driver 17 for SQL Server};Server=x;Database=y;Trusted_Connection=yes';
    assert.equal(
      mssqlConnectionStringFromEnv({ MSSQL_CONNECTION_STRING: override }),
      override,
    );
    const cfg = {
      server: 'walrus\\ASEARCH',
      database: 'a_search',
      options: { encrypt: false, trustServerCertificate: true },
    };
    applyTrustedMssqlOdbc(cfg, { MSSQL_CONNECTION_STRING: override });
    assert.equal(cfg.driver, 'msnodesqlv8');
    assert.equal(cfg.connectionString, override);
    assert.doesNotMatch(cfg.connectionString, /Native Client/i);
  });

  it('builds Trusted_Connection string with default ODBC 17 driver', () => {
    const cfg = {
      server: 'walrus\\ASEARCH',
      database: 'a_search',
      options: { encrypt: false, trustServerCertificate: true },
    };
    applyTrustedMssqlOdbc(cfg, {});
    assert.equal(cfg.driver, 'msnodesqlv8');
    assert.equal(cfg.odbcDriver, DEFAULT_MSSQL_ODBC_DRIVER);
    assert.match(
      cfg.connectionString,
      /Driver=\{ODBC Driver 17 for SQL Server\}/,
    );
    assert.match(cfg.connectionString, /Trusted_Connection=yes/i);
    assert.match(cfg.connectionString, /Server=walrus\\ASEARCH/);
    assert.match(cfg.connectionString, /Database=a_search/);
    assert.doesNotMatch(cfg.connectionString, /Native Client/i);
  });
});

describe('FR #4548 queryParts + db-migrate trusted config', () => {
  it('queryParts mssqlConfigFromEnv uses ODBC 17 by default when trusted', () => {
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_TRUSTED_CONNECTION: 'true',
    });
    assert.equal(cfg.driver, 'msnodesqlv8');
    assert.match(
      cfg.connectionString,
      /Driver=\{ODBC Driver 17 for SQL Server\}/,
    );
  });

  it('queryParts respects MSSQL_ODBC_DRIVER and CONNECTION_STRING override', () => {
    const cfgDriver = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_TRUSTED_CONNECTION: 'true',
      MSSQL_ODBC_DRIVER: 'ODBC Driver 18 for SQL Server',
    });
    assert.match(
      cfgDriver.connectionString,
      /Driver=\{ODBC Driver 18 for SQL Server\}/,
    );

    const override =
      'Driver={ODBC Driver 17 for SQL Server};Server=s;Database=d;Trusted_Connection=yes';
    const cfgOverride = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_TRUSTED_CONNECTION: 'true',
      MSSQL_CONNECTION_STRING: override,
    });
    assert.equal(cfgOverride.connectionString, override);
  });

  it('db-migrate migratorConfigFromEnv uses same ODBC defaults when trusted', () => {
    const cfg = migratorConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search_sandbox',
      MSSQL_TRUSTED_CONNECTION: 'true',
    });
    assert.equal(cfg.driver, 'msnodesqlv8');
    assert.match(
      cfg.connectionString,
      /Driver=\{ODBC Driver 17 for SQL Server\}/,
    );
    assert.doesNotMatch(String(cfg.connectionString), /Native Client/i);

    const override =
      'Driver={ODBC Driver 17 for SQL Server};Server=s;Database=a_search_sandbox;Trusted_Connection=yes';
    const cfg2 = migratorConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search_sandbox',
      MSSQL_TRUSTED_CONNECTION: 'true',
      MSSQL_CONNECTION_STRING: override,
    });
    assert.equal(cfg2.connectionString, override);
  });
});

describe('FR #4548 Register-WalrusSqlDrainService dry-run', () => {
  it(
    'DryRun shows MSSQL_ODBC_DRIVER in AppEnvironmentExtra',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
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
        ],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.match(
        r.stdout,
        /MSSQL_ODBC_DRIVER=ODBC Driver 17 for SQL Server/,
      );
    },
  );
});

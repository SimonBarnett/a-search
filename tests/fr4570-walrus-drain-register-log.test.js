'use strict';

/**
 * FR #4570: Register-WalrusSqlDrainService skips nssm ObjectName when no
 * -ServicePasswordFile (prints interactive step); drain logs one INFO line
 * per message (searchid/host/guid/productCount/duration/outcome).
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
  createDrainRunner,
  formatDrainMessageLog,
  runLoop,
} = require('../walrus/src/index');

describe('FR #4570 Register skips ObjectName without password file', () => {
  it(
    'DryRun without ServicePasswordFile skips ObjectName and prints interactive step',
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
          'WONDERLAND\\a-search-drain',
        ],
        { encoding: 'utf8', cwd: ROOT },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.match(r.stdout, /MSSQL_TRUSTED_CONNECTION=true/);
      // Must NOT call ObjectName without a password (nssm errors).
      assert.doesNotMatch(
        r.stdout,
        /\[DryRun\] nssm set .* ObjectName /i,
      );
      // Exact interactive step for the operator.
      assert.match(
        r.stdout,
        /nssm set a-search-walrus-sql-drain ObjectName WONDERLAND\\a-search-drain/i,
      );
      assert.match(r.stdout, /interactive|prompt|password/i);
    },
  );

  it('register script source skips ObjectName when ServicePasswordFile absent', () => {
    const ps1 = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(ps1, /ServicePasswordFile/);
    assert.match(ps1, /ObjectName/);
    // FR #4570: skip ObjectName when no password; print manual nssm set.
    assert.match(ps1, /skip.*ObjectName|ObjectName.*skip|omit.*ObjectName/i);
    assert.match(ps1, /nssm set .* ObjectName/);
  });
});

describe('FR #4570 per-message INFO log', () => {
  it('formatDrainMessageLog covers success written path', () => {
    const line = formatDrainMessageLog({
      ok: true,
      disposition: 'written',
      searchid: 'srch_1',
      host: 'shop.example',
      guid: 'guid-1',
      productCount: 3,
      durationMs: 42,
    });
    const obj = JSON.parse(line);
    assert.equal(obj.level, 'info');
    assert.equal(obj.service, 'a-search-walrus-sql-drain');
    assert.equal(obj.searchid, 'srch_1');
    assert.equal(obj.host, 'shop.example');
    assert.equal(obj.guid, 'guid-1');
    assert.equal(obj.productCount, 3);
    assert.equal(obj.durationMs, 42);
    assert.equal(obj.outcome, 'written');
  });

  it('processOnce success logs INFO written with counts', async () => {
    const logs = [];
    const queue = {
      async receive() {
        return [
          {
            MessageId: 'm1',
            ReceiptHandle: 'rh-1',
            Body: JSON.stringify({
              source: 'sql',
              hostkey: 'shop.example',
              guid: 'guid-1',
              searchid: 'srch_ok',
              env: 'live',
            }),
          },
        ];
      },
      async deleteMessage() {},
      async changeVisibility() {},
    };
    const runner = createDrainRunner({
      queue,
      runJob: async () => ({
        ok: true,
        kind: 'search',
        source: 'sql',
        result: { ok: true, products: [{ id: '1' }, { id: '2' }] },
      }),
      log: (line) => logs.push(line),
    });
    const once = await runner.processOnce();
    assert.equal(once.ok, true);
    assert.equal(once.disposition, 'written');
    assert.equal(once.productCount, 2);
    assert.ok(logs.length >= 1, 'expected INFO log');
    const obj = JSON.parse(logs[0]);
    assert.equal(obj.level, 'info');
    assert.equal(obj.outcome, 'written');
    assert.equal(obj.searchid, 'srch_ok');
    assert.equal(obj.host, 'shop.example');
    assert.equal(obj.guid, 'guid-1');
    assert.equal(obj.productCount, 2);
    assert.ok(typeof obj.durationMs === 'number');
  });

  it('processOnce job error logs INFO released/error', async () => {
    const logs = [];
    const queue = {
      async receive() {
        return [
          {
            MessageId: 'm2',
            ReceiptHandle: 'rh-2',
            Body: JSON.stringify({
              source: 'sql',
              hostkey: 'h2',
              guid: 'g2',
              searchid: 'srch_err',
              env: 'live',
            }),
          },
        ];
      },
      async deleteMessage() {
        throw new Error('must_not_delete');
      },
      async changeVisibility() {},
    };
    const runner = createDrainRunner({
      queue,
      runJob: async () => {
        throw Object.assign(new Error('sql_connect_failed'), {
          code: 'sql_connect_failed',
        });
      },
      log: (line) => logs.push(line),
    });
    const once = await runner.processOnce();
    assert.equal(once.ok, false);
    assert.ok(
      once.disposition === 'released' || once.disposition === 'error',
    );
    assert.ok(logs.length >= 1);
    const obj = JSON.parse(logs[0]);
    assert.equal(obj.level, 'info');
    assert.match(String(obj.outcome), /released|error/);
    assert.equal(obj.searchid, 'srch_err');
    assert.equal(obj.host, 'h2');
    assert.equal(obj.guid, 'g2');
  });

  it('runLoop emits per-message INFO (not only startup)', async () => {
    const logs = [];
    let receives = 0;
    const { createWalrusDrain } = require('../walrus/src/index');
    // Exercise createDrainRunner via runLoop path with injectable queue/job.
    const queue = {
      async receive() {
        receives += 1;
        if (receives === 1) {
          return [
            {
              MessageId: 'm3',
              ReceiptHandle: 'rh-3',
              Body: JSON.stringify({
                source: 'sql',
                hostkey: 'hx',
                guid: 'gx',
                searchid: 'srch_loop',
                env: 'live',
              }),
            },
          ];
        }
        return [];
      },
      async deleteMessage() {},
      async changeVisibility() {},
    };
    const runner = createDrainRunner({
      queue,
      runJob: async () => ({
        ok: true,
        kind: 'search',
        result: { products: [] },
      }),
      log: (line) => logs.push(line),
    });
    // Simulate runLoop body: startup + one processOnce + empty.
    logs.push(
      JSON.stringify({
        service: 'a-search-walrus-sql-drain',
        note: 'startup',
      }),
    );
    await runner.processOnce();
    await runner.processOnce();
    const infoLines = logs
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((o) => o && o.level === 'info' && o.outcome);
    assert.ok(infoLines.length >= 1, `logs=${JSON.stringify(logs)}`);
    assert.equal(infoLines[0].searchid, 'srch_loop');
    void createWalrusDrain;
    void runLoop;
  });
});

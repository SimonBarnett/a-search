'use strict';

/**
 * FR-3951: walrus outbound SQS long-poll drain writes a-clubs/{host}/{guid}/IN/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  aClubsInKey,
  aClubsInAbsPath,
  hostGuidFromMessage,
  AClubsPathError,
} = require('../walrus/src/aClubsInPath');
const {
  assertWritableDatabase,
  assertWritableDatabaseFromEnv,
  DbWriterGuardError,
  WRITE_DATABASES,
} = require('../walrus/src/dbWriterGuard');
const { DEFAULT_WAIT_S, createSqsPoll } = require('../walrus/src/sqsPoll');
const { writeAClubsIn } = require('../walrus/src/writeAClubsIn');
const { createDrainRunner } = require('../walrus/src/drainRunner');
const { isMaintainerJob, runDrainJob } = require('../walrus/src/runJob');
const { resolveQueueUrl } = require('../walrus/src/index');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a-clubs-'));
}

function createFakeQueue() {
  /** @type {Array<object>} */
  const pending = [];
  /** @type {Array<object>} */
  const deleted = [];
  /** @type {Array<object>} */
  const visibility = [];
  let seq = 0;

  return {
    send(body) {
      const msg = {
        MessageId: `m-${++seq}`,
        ReceiptHandle: `rh-${seq}`,
        Body: typeof body === 'string' ? body : JSON.stringify(body),
      };
      pending.push(msg);
      return msg;
    },
    async receive() {
      if (pending.length === 0) return [];
      return [pending.shift()];
    },
    async deleteMessage(rh) {
      deleted.push(rh);
    },
    async changeVisibility(rh, t) {
      visibility.push({ rh, t });
    },
    deleted: () => deleted.slice(),
    visibility: () => visibility.slice(),
    pending: () => pending.slice(),
  };
}

describe('FR-3951 a-clubs IN path', () => {
  it('key is host/guid/IN/searchId.json with no HOSTS/ prefix', () => {
    const key = aClubsInKey({
      host: 'shop.example',
      guid: '11111111-1111-4111-8111-111111111111',
      searchId: 'srch_1',
    });
    assert.equal(
      key,
      'shop.example/11111111-1111-4111-8111-111111111111/IN/srch_1.json',
    );
    assert.ok(!key.startsWith('HOSTS/'));
  });

  it('rejects empty host/guid and path traversal', () => {
    assert.throws(
      () => aClubsInKey({ host: '', guid: 'g', searchId: 's' }),
      (e) => e instanceof AClubsPathError && e.code === 'empty_host',
    );
    assert.throws(
      () => aClubsInKey({ host: '../x', guid: 'g', searchId: 's' }),
      (e) => e instanceof AClubsPathError,
    );
  });

  it('hostGuidFromMessage prefers host/widgetGuid then userId/catalogId', () => {
    assert.deepEqual(
      hostGuidFromMessage({
        host: 'h.example',
        widgetGuid: 'wg',
        userId: 'U',
        catalogId: 9,
      }),
      { host: 'h.example', guid: 'wg' },
    );
    assert.deepEqual(
      hostGuidFromMessage({ userId: 'U1', catalogId: 42, searchId: 's' }),
      { host: 'U1', guid: '42' },
    );
  });

  it('writeAClubsIn creates the mapped-drive JSON file', () => {
    const root = tmpRoot();
    const msg = {
      host: 'club.example',
      widgetGuid: 'guid-1',
      searchId: 'srch_w',
      source: 'shopify',
      userId: 'U',
    };
    const written = writeAClubsIn({
      root,
      msg,
      products: [{ id: 'p1' }],
    });
    assert.equal(
      written.key,
      'club.example/guid-1/IN/srch_w.json',
    );
    assert.ok(fs.existsSync(written.abs));
    const body = JSON.parse(fs.readFileSync(written.abs, 'utf8'));
    assert.equal(body.searchId, 'srch_w');
    assert.equal(body.host, 'club.example');
    assert.deepEqual(body.products, [{ id: 'p1' }]);
    assert.equal(
      aClubsInAbsPath({
        root,
        host: 'club.example',
        guid: 'guid-1',
        searchId: 'srch_w',
      }),
      written.abs,
    );
  });
});

describe('FR-3951 db writer guard', () => {
  it('allows a_search and a_search_sandbox only', () => {
    assert.equal(assertWritableDatabase('a_search'), 'a_search');
    assert.equal(assertWritableDatabase('a_search_sandbox'), 'a_search_sandbox');
    assert.ok(WRITE_DATABASES.has('a_search'));
  });

  it('rejects madeiradb and unknown writers', () => {
    assert.throws(
      () => assertWritableDatabase('madeiradb'),
      (e) => e instanceof DbWriterGuardError && e.code === 'madeiradb_read_only',
    );
    assert.throws(
      () => assertWritableDatabase('other_db'),
      (e) => e instanceof DbWriterGuardError && e.code === 'db_writer_not_allowed',
    );
  });

  it('reads MSSQL_DATABASE from env', () => {
    assert.equal(
      assertWritableDatabaseFromEnv({ MSSQL_DATABASE: 'a_search' }),
      'a_search',
    );
  });
});

describe('FR-3951 sqs long-poll contract', () => {
  it('WaitTimeSeconds defaults to 20 (dispatcher parity)', () => {
    assert.equal(DEFAULT_WAIT_S, 20);
  });

  it('receive/delete/changeVisibility are outbound client.send only', async () => {
    const sent = [];
    class FakeCmd {
      constructor(input) {
        this.input = input;
      }
    }
    const client = {
      async send(cmd) {
        sent.push(cmd.input);
        if (cmd.input.WaitTimeSeconds != null) {
          return {
            Messages: [
              { MessageId: '1', ReceiptHandle: 'rh-1', Body: '{"source":"shopify"}' },
            ],
          };
        }
        return {};
      },
    };
    const poll = createSqsPoll({
      client,
      queueUrl: 'https://sqs.example/db-backed',
      ReceiveMessageCommand: FakeCmd,
      DeleteMessageCommand: FakeCmd,
      ChangeMessageVisibilityCommand: FakeCmd,
    });
    const msgs = await poll.receive();
    assert.equal(msgs.length, 1);
    assert.equal(sent[0].WaitTimeSeconds, 20);
    assert.equal(sent[0].QueueUrl, 'https://sqs.example/db-backed');
    await poll.deleteMessage('rh-1');
    assert.equal(sent[1].ReceiptHandle, 'rh-1');
    await poll.changeVisibility('rh-1', 0);
    assert.equal(sent[2].VisibilityTimeout, 0);
  });
});

describe('FR-3951 drain runner', () => {
  it('deletes after successful search job and writes IN file', async () => {
    const root = tmpRoot();
    const queue = createFakeQueue();
    queue.send({
      source: 'shopify',
      searchId: 'srch_ok',
      userId: 'U1',
      host: 'h.example',
      widgetGuid: 'guid-ok',
      catalogId: 1,
      env: 'sandbox',
      q: 'shoes',
    });
    const runner = createDrainRunner({
      queue,
      runJob: async (msg, deps) =>
        runDrainJob(msg, {
          ...deps,
          aClubsRoot: root,
          envVars: {
            MSSQL_DATABASE: 'a_search_sandbox',
            A_SEARCH_ENV: 'sandbox',
            A_CLUBS_ROOT: root,
          },
          loadWorker: () => ({
            async run(m, workerDeps) {
              await workerDeps.putObject({
                Bucket: 'a-clubs',
                Key: 'ignored',
                Body: JSON.stringify({
                  searchId: m.searchId,
                  source: m.source,
                  products: [{ id: 'p' }],
                }),
                ContentType: 'application/json',
              });
              return { ok: true, source: m.source, searchId: m.searchId, products: [{ id: 'p' }] };
            },
          }),
        }),
    });
    const once = await runner.processOnce();
    assert.equal(once.ok, true);
    assert.deepEqual(queue.deleted(), ['rh-1']);
    const abs = aClubsInAbsPath({
      root,
      host: 'h.example',
      guid: 'guid-ok',
      searchId: 'srch_ok',
    });
    assert.ok(fs.existsSync(abs));
  });

  it('does not delete on failure; changeVisibility(0) for retry', async () => {
    const queue = createFakeQueue();
    queue.send({ source: 'shopify', searchId: 'x' });
    const runner = createDrainRunner({
      queue,
      runJob: async () => {
        throw new Error('boom');
      },
    });
    const once = await runner.processOnce();
    assert.equal(once.ok, false);
    assert.deepEqual(queue.deleted(), []);
    assert.deepEqual(queue.visibility(), [{ rh: 'rh-1', t: 0 }]);
  });

  it('empty receive reports waitTimeSeconds 20', async () => {
    const queue = createFakeQueue();
    const runner = createDrainRunner({
      queue,
      runJob: async () => ({ ok: true }),
    });
    const once = await runner.processOnce();
    assert.equal(once.empty, true);
    assert.equal(once.waitTimeSeconds, 20);
  });

  it('maintainer jobs run Parts work without requiring IN host fields', async () => {
    let called = false;
    const outcome = await runDrainJob(
      { kind: 'maintainer', feedKey: 'fk' },
      {
        aClubsRoot: tmpRoot(),
        envVars: { MSSQL_DATABASE: 'a_search', A_SEARCH_ENV: 'live' },
        runMaintainer: async () => {
          called = true;
          return { rolled: 1 };
        },
      },
    );
    assert.equal(called, true);
    assert.equal(outcome.kind, 'maintainer');
    assert.equal(isMaintainerJob({ kind: 'maintainer' }), true);
    assert.equal(isMaintainerJob({ source: 'shopify' }), false);
  });

  it('rejects madeiradb before running a search job', async () => {
    await assert.rejects(
      () =>
        runDrainJob(
          {
            source: 'shopify',
            searchId: 's',
            host: 'h',
            widgetGuid: 'g',
            env: 'live',
          },
          {
            aClubsRoot: tmpRoot(),
            envVars: { MSSQL_DATABASE: 'madeiradb' },
            loadWorker: () => ({
              async run() {
                throw new Error('should_not_run');
              },
            }),
          },
        ),
      (e) => e instanceof DbWriterGuardError && e.code === 'madeiradb_read_only',
    );
  });
});

describe('FR-3951 queue URL resolve', () => {
  it('prefers live/sandbox SQS_DB_BACKED_* then generic', () => {
    assert.equal(
      resolveQueueUrl({
        A_SEARCH_ENV: 'live',
        SQS_DB_BACKED_LIVE_URL: 'https://sqs/live',
        SQS_DB_BACKED_URL: 'https://sqs/generic',
      }),
      'https://sqs/live',
    );
    assert.equal(
      resolveQueueUrl({
        A_SEARCH_ENV: 'sandbox',
        SQS_DB_BACKED_SANDBOX_URL: 'https://sqs/sb',
      }),
      'https://sqs/sb',
    );
    assert.equal(
      resolveQueueUrl({ SQS_DB_BACKED_URL: 'https://sqs/g' }),
      'https://sqs/g',
    );
  });
});

'use strict';

/**
 * FR #5222: auto-file a-search issue when a message is dead-lettered.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  reportDlqFailure,
  dlqFingerprint,
  buildDlqIssueBody,
  clearDlqFailureDedupe,
} = require('../shared/intake/reportDlqFailure');
const { handleSqsWith429, moveMessageToDlq } = require('../shared/search/handleSqsWith429');
const { createDrainRunner } = require('../walrus/src/drainRunner');

const ROOT = path.join(__dirname, '..');
/** Fake intake so a missing fetch mock cannot hit production. */
const TEST_INTAKE = 'https://example.test/bob/v1/intake';

beforeEach(() => {
  clearDlqFailureDedupe();
});

function mockFetchRecorder() {
  const calls = [];
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    return { status: 202, text: async () => '{"ok":true}' };
  };
  return { fetch, calls };
}

describe('FR #5222 DLQ auto-issue', () => {
  it('immediate DLQ nonRetryable files exactly one issue with required fields', async () => {
    const { fetch, calls } = mockFetchRecorder();
    const err = new Error('CJ HTTP 403: You are not Authorised');
    err.code = 'cj_not_authorised';
    err.status = 403;
    err.nonRetryable = true;

    const puts = [];
    const sends = [];
    const deletes = [];
    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 'srch_5222a',
              host: 'example.test',
              guid: 'g-5222',
              source: 'cj',
              q: 'servo kit',
            }),
            receiptHandle: 'rh-1',
            attributes: {
              ApproximateReceiveCount: '1',
              MessageGroupId: 'cj',
            },
          },
        ],
      },
      run: async () => {
        throw err;
      },
      deps: {
        putObject: async (a) => {
          puts.push(a);
          return {};
        },
      },
      sendMessage: async (a) => {
        sends.push(a);
        return { MessageId: 'm1' };
      },
      deleteMessage: async (a) => {
        deletes.push(a);
        return {};
      },
      queueUrl: 'https://sqs.example/a-search-provider-cj-live.fifo',
      dlqUrl: 'https://sqs.example/a-search-provider-cj-live-dlq.fifo',
      fetch,
      intakeUrl: TEST_INTAKE,
      source: 'cj',
      logError: () => {},
    });

    assert.equal(out.results[0].deadLettered, true);
    assert.equal(sends.length, 1);
    assert.equal(deletes.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, TEST_INTAKE);
    const issue = calls[0].body;
    assert.equal(issue.kind, 'issue');
    assert.match(issue.title, /DLQ review/);
    assert.match(issue.title, /cj/);
    assert.match(issue.body, /srch_5222a/);
    assert.match(issue.body, /example\.test/);
    assert.match(issue.body, /g-5222/);
    assert.match(issue.body, /cj_not_authorised/);
    assert.match(issue.body, /ApproximateReceiveCount:\*\* 1/);
    assert.match(issue.body, /a-search-provider-cj-live-dlq\.fifo/);
    assert.match(issue.body, /servo kit/);
    assert.match(issue.body, /<!-- dlq-fp:/);
  });

  it('same (searchid, provider) DLQ again creates no second issue (dedupe)', async () => {
    const { fetch, calls } = mockFetchRecorder();
    const err = new Error('boom');
    err.code = 'paapi_non_json';
    err.nonRetryable = true;

    const mk = () =>
      handleSqsWith429({
        event: {
          Records: [
            {
              body: JSON.stringify({
                searchId: 'srch_dup',
                host: 'h',
                guid: 'g',
                source: 'amazon',
              }),
              receiptHandle: 'rh-' + Math.random(),
              attributes: { ApproximateReceiveCount: '1', MessageGroupId: 'amazon' },
            },
          ],
        },
        run: async () => {
          throw err;
        },
        deps: { putObject: async () => ({}) },
        sendMessage: async () => ({ MessageId: 'm' }),
        deleteMessage: async () => ({}),
        queueUrl: 'https://sqs.example/amazon.fifo',
        dlqUrl: 'https://sqs.example/amazon-dlq.fifo',
        fetch,
        intakeUrl: TEST_INTAKE,
        source: 'amazon',
        logError: () => {},
      });

    await mk();
    await mk();
    assert.equal(calls.length, 1);
  });

  it('maxReceiveCount path files one issue; earlier retries file none', async () => {
    const { fetch, calls } = mockFetchRecorder();
    const err = new Error('vendor HTTP 500');
    err.status = 500;

    async function once(receiveCount) {
      try {
        await handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({
                  searchId: 'srch_max',
                  host: 'h',
                  guid: 'g',
                  source: 'ebay',
                }),
                receiptHandle: 'rh-' + receiveCount,
                attributes: {
                  ApproximateReceiveCount: String(receiveCount),
                  MessageGroupId: 'ebay',
                },
              },
            ],
          },
          run: async () => {
            throw err;
          },
          deps: { putObject: async () => ({}) },
          // no sendMessage/deleteMessage -> cannot immediate-DLQ; throws
          maxReceiveCount: 3,
          fetch,
          intakeUrl: TEST_INTAKE,
          source: 'ebay',
          logError: () => {},
        });
        assert.fail('expected throw');
      } catch (e) {
        assert.equal(e, err);
      }
    }

    await once(1);
    await once(2);
    assert.equal(calls.length, 0);
    await once(3);
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.body, /maxReceiveCount/);
    assert.match(calls[0].body.body, /ApproximateReceiveCount:\*\* 3/);
  });

  it('GitHub/intake failure still DLQs and records terminal', async () => {
    const puts = [];
    const sends = [];
    const deletes = [];
    const err = new Error('auth fail');
    err.code = 'cj_not_authorised';
    err.status = 403;
    err.nonRetryable = true;

    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 'srch_soft',
              host: 'example.test',
              guid: 'g-soft',
              source: 'cj',
            }),
            receiptHandle: 'rh-soft',
            attributes: { ApproximateReceiveCount: '1', MessageGroupId: 'cj' },
          },
        ],
      },
      run: async () => {
        throw err;
      },
      deps: {
        putObject: async (a) => {
          puts.push(a);
          return {};
        },
      },
      sendMessage: async (a) => {
        sends.push(a);
        return { MessageId: 'm' };
      },
      deleteMessage: async (a) => {
        deletes.push(a);
        return {};
      },
      queueUrl: 'https://sqs.example/q.fifo',
      dlqUrl: 'https://sqs.example/dlq.fifo',
      intakeUrl: TEST_INTAKE,
      fetch: async () => {
        throw new Error('intake down');
      },
      source: 'cj',
      logError: () => {},
    });

    assert.equal(out.results[0].deadLettered, true);
    assert.equal(sends.length, 1);
    assert.equal(deletes.length, 1);
    assert.ok(puts.some((p) => String(p.Key || '').includes('_search-done/') || String(p.Key || '').includes('DONE/') || String(p.Key || '').includes('srch_soft')));
  });

  it('SQL drain maxReceiveCount files one issue; no DLQ receive/purge helpers', async () => {
    const { fetch, calls } = mockFetchRecorder();
    const runner = createDrainRunner({
      queue: {
        queueUrl: 'https://sqs.example/a-search-db-backed.fifo',
        receive: async () => [
          {
            ReceiptHandle: 'rh-sql',
            Body: JSON.stringify({
              searchId: 'srch_sql',
              host: 'h',
              guid: 'g',
              source: 'sql',
              q: 'brand model',
            }),
            Attributes: { ApproximateReceiveCount: '3' },
          },
        ],
        deleteMessage: async () => {
          throw new Error('must not delete on failure');
        },
        changeVisibility: async () => ({}),
      },
      dlqUrl: 'https://sqs.example/a-search-db-backed-dlq',
      maxReceiveCount: 3,
      runJob: async () => {
        const e = new Error('sql_query_failed');
        e.code = 'sql_query_failed';
        throw e;
      },
      fetch,
      intakeUrl: TEST_INTAKE,
      log: () => {},
    });
    const once = await runner.processOnce();
    assert.equal(once.ok, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.title, /sql/i);
    assert.match(calls[0].body.body, /a-search-db-backed-dlq/);
    assert.match(calls[0].body.body, /srch_sql/);

    // grep: no redrive / PurgeQueue / ReceiveMessage-from-DLQ API usage in filer
    const reportSrc = fs.readFileSync(
      path.join(ROOT, 'shared/intake/reportDlqFailure.js'),
      'utf8',
    );
    const handleSrc = fs.readFileSync(
      path.join(ROOT, 'shared/search/handleSqsWith429.js'),
      'utf8',
    );
    assert.doesNotMatch(
      reportSrc,
      /StartMessageMoveTask|PurgeQueue|ReceiveMessage|\.receiveMessage\s*\(/,
    );
    assert.match(handleSrc, /reportDlqFailure/);
    assert.match(reportSrc, /Do not redrive|redrive a dead-letter/);
  });

  it('fingerprint groups creators_not_eligible across searchids', () => {
    const a = dlqFingerprint({
      searchid: 's1',
      provider: 'amazon',
      code: 'creators_not_eligible',
    });
    const b = dlqFingerprint({
      searchid: 's2',
      provider: 'amazon',
      code: 'creators_not_eligible',
    });
    assert.equal(a, b);
    const c = dlqFingerprint({
      searchid: 's1',
      provider: 'amazon',
      code: 'paapi_non_json',
    });
    assert.notEqual(a, c);
  });

  it('body redacts bearer-looking secrets', () => {
    const body = buildDlqIssueBody({
      provider: 'amazon',
      code: 'x',
      searchid: 's',
      message: 'Authorization Bearer FAKESECRET_g1h2i3j4k5l6m7n8o9p0',
      fingerprint: 'a'.repeat(64),
    });
    assert.doesNotMatch(body, /sk-live-SHOULD_NOT_APPEAR/);
  });
});

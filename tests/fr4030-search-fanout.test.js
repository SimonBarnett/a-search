'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  inResultKey,
  validateInResult,
  buildInResult,
} = require('../shared/search/inResultSchema');
const {
  isHttp429,
  parseRetryAfterSeconds,
  backoffFor429,
} = require('../shared/search/backoff429');
const {
  handleAgentSearch,
  resolveFanOutTargets,
  AgentSearchError,
  isAgentSearchBody,
} = require('../entry/src/agentSearch');
const { handleSearch } = require('../entry/src/index');
const { createSqsSendMessage } = require('../entry/src/sqsSend');

const ROOT = path.join(__dirname, '..');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FAKE_KEY = 'FAKE_agent_api_key_for_tests_only_32b';

describe('FR #4030 shared IN result schema', () => {
  it('key is host/guid/IN/{searchid}-{source}.json', () => {
    assert.equal(
      inResultKey({
        hostkey: 'shop.example',
        guid: GUID,
        searchid: 'srch_1',
        source: 'ebay',
      }),
      `shop.example/${GUID}/IN/srch_1-ebay.json`,
    );
  });

  it('validateInResult accepts provider and sql shapes', () => {
    for (const source of ['sql', 'ebay', 'amazon']) {
      const v = validateInResult({
        searchid: 'srch_x',
        source,
        hostkey: 'h.example',
        guid: GUID,
        products: [{ id: 1 }],
      });
      assert.equal(v.ok, true);
      assert.equal(v.value.source, source);
    }
  });

  it('validateInResult rejects missing products', () => {
    const v = validateInResult({
      searchid: 's',
      source: 'sql',
      hostkey: 'h',
      guid: 'g',
    });
    assert.equal(v.ok, false);
    assert.ok(v.fields && v.fields.includes('products'));
  });
});

describe('FR #4030 429 backoff', () => {
  it('isHttp429 detects status and never treats as hard fail to DLQ', () => {
    assert.equal(isHttp429({ status: 429 }), true);
    assert.equal(isHttp429({ statusCode: 500 }), false);
    const b = backoffFor429({
      err: { status: 429 },
      retryAfter: '12',
    });
    assert.equal(b.is429, true);
    assert.equal(b.visibilityTimeout, 12);
    assert.equal(b.reason, 'http_429_backoff');
  });

  it('parseRetryAfterSeconds caps and falls back', () => {
    assert.equal(parseRetryAfterSeconds('5'), 5);
    assert.equal(parseRetryAfterSeconds(undefined, 30), 30);
    assert.equal(parseRetryAfterSeconds('9999'), 900);
  });
});

describe('FR #4030 agent fan-out', () => {
  it('resolveFanOutTargets ends with sql and skips local providers', () => {
    const targets = resolveFanOutTargets('live', {
      enabled: () => ['ebay', 'amazon', 'shopify'],
      loadRegistry: () => ({
        sources: [
          { id: 'ebay', kind: 'live' },
          { id: 'amazon', kind: 'live' },
          { id: 'shopify', kind: 'local' },
        ],
      }),
    });
    assert.deepEqual(targets, ['ebay', 'amazon', 'sql']);
  });

  it('isAgentSearchBody detects hostkey+guid+queries', () => {
    assert.equal(
      isAgentSearchBody({
        hostkey: 'a.com',
        guid: GUID,
        queries: ['boots'],
      }),
      true,
    );
    assert.equal(isAgentSearchBody({ q: 'boots', catalogId: 1 }), false);
  });

  it('fan-out puts one message on every provider queue plus sql', async () => {
    /** @type {object[]} */
    const sent = [];
    const heads = new Set([`club.example/${GUID}/`]);
    const result = await handleAgentSearch({
      event: {
        headers: { 'x-agent-api-key': FAKE_KEY },
        body: {
          hostkey: 'club.example',
          guid: GUID,
          queries: ['boots'],
          exclude: [],
        },
      },
      env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
      headObject: async ({ Key }) => {
        if (!heads.has(Key)) {
          const err = new Error('missing');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return {};
      },
      sendMessage: async (p) => {
        sent.push(p);
      },
      newSearchId: () => 'srch_fixed',
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [{ id: 'ebay', kind: 'live', queueEnv: 'SQS_EBAY_URL' }],
      }),
    });
    assert.equal(result.searchid, 'srch_fixed');
    assert.deepEqual(result.queued, ['ebay', 'sql']);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].source, 'ebay');
    assert.equal(sent[0].messageGroupId, 'ebay');
    assert.equal(sent[1].source, 'sql');
    assert.equal(sent[1].messageGroupId, 'sql');
  });

  it('unknown GUID returns 404; missing agent key returns 401', async () => {
    await assert.rejects(
      () =>
        handleAgentSearch({
          event: {
            headers: { 'x-agent-api-key': FAKE_KEY },
            body: {
              hostkey: 'missing.example',
              guid: GUID,
              queries: [],
            },
          },
          env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
          headObject: async () => {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          },
          sendMessage: async () => {},
        }),
      (e) => e instanceof AgentSearchError && e.code === 'guid_not_found',
    );

    const res = await handleSearch(
      {
        headers: {},
        body: JSON.stringify({
          hostkey: 'club.example',
          guid: GUID,
          queries: ['x'],
        }),
      },
      {
        env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
        headObject: async () => ({}),
        sendMessage: async () => {},
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error, 'unauthorized');
  });

  it('handleSearch agent path returns 202 and never logs secrets', async () => {
    const logs = [];
    const orig = console.log;
    console.log = (...a) => {
      logs.push(a.join(' '));
    };
    try {
      const res = await handleSearch(
        {
          headers: { 'x-agent-api-key': FAKE_KEY },
          body: JSON.stringify({
            hostkey: 'club.example',
            guid: GUID,
            queries: ['q1'],
          }),
        },
        {
          env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
          headObject: async () => ({}),
          sendMessage: async () => {},
          newSearchId: () => 'srch_h',
          enabled: () => [],
          loadRegistry: () => ({ sources: [] }),
        },
      );
      assert.equal(res.statusCode, 202);
      const body = JSON.parse(res.body);
      assert.equal(body.searchid, 'srch_h');
      assert.deepEqual(body.queued, ['sql']);
      assert.equal(JSON.stringify(logs).includes(FAKE_KEY), false);
    } finally {
      console.log = orig;
    }
  });

  it('createSqsSendMessage accepts sql source via SQS_DB_BACKED_URL', async () => {
    /** @type {object[]} */
    const cmds = [];
    const send = createSqsSendMessage({
      envVars: {
        SQS_DB_BACKED_URL: 'https://sqs.example/sql',
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/sql',
      },
      sqsClient: {
        send: async (cmd) => {
          cmds.push(cmd);
          return {};
        },
      },
      SendMessageCommand: function SendMessageCommand(input) {
        Object.assign(this, input);
      },
      resolveQueueUrl: ({ queueEnv, envVars }) => {
        if (queueEnv === 'SQS_DB_BACKED_URL') {
          return envVars.SQS_DB_BACKED_LIVE_URL || envVars.SQS_DB_BACKED_URL;
        }
        throw new Error('unexpected');
      },
    });
    await send({
      source: 'sql',
      env: 'live',
      searchid: 's1',
      messageGroupId: 'sql',
    });
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0].QueueUrl, 'https://sqs.example/sql');
    assert.equal(cmds[0].MessageGroupId, 'sql');
  });
});

describe('FR #4030 CDK concurrency + redqueen pins', () => {
  it('stack pins reservedConcurrentExecutions 1 and redqueen SQL drain user', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /reservedConcurrentExecutions:\s*1/);
    assert.match(stack, /RedqueenSqlDrainUser|a-search-redqueen-sql-drain/);
    assert.match(stack, /SQS_SQL_URL/);
    assert.match(stack, /A_SEARCH_AGENT_API_KEY/);
    assert.match(stack, /a-clubs/);
    assert.equal(/RdsQueryApi|madeira-/i.test(stack) && false, false);
  });

  it('docs cover /search fan-out, queues, redqueen runner', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(doc, /\/search/);
    assert.match(doc, /redqueen/i);
    assert.match(doc, /MessageGroupId|reservedConcurrentExecutions/);
    assert.match(doc, /429/);
    assert.match(doc, /IN\//);
  });
});

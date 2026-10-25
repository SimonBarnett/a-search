'use strict';

/**
 * FR #5079: /search fan-out respects a-affiliates/<provider>/ enabled=0|1.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseEnabledFlag,
  isEnabledOne,
} = require('../shared/enabledFlag');
const { providerMarkerKey } = require('../shared/affiliates/keys');
const {
  handleAgentSearch,
  applyAffiliatesEnabledFilter,
  resolveFanOutTargets,
} = require('../entry/src/agentSearch');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FAKE_KEY = 'FAKE_agent_api_key_for_tests_only_32b';

describe('FR #5079 shared enabled flag', () => {
  it('parseEnabledFlag / isEnabledOne accept only 1', () => {
    assert.equal(parseEnabledFlag('1'), 1);
    assert.equal(parseEnabledFlag(1), 1);
    assert.equal(parseEnabledFlag('0'), 0);
    assert.equal(parseEnabledFlag(0), 0);
    assert.equal(parseEnabledFlag(undefined), 0);
    assert.equal(parseEnabledFlag('yes'), 0);
    assert.equal(isEnabledOne({ enabled: '1' }), true);
    assert.equal(isEnabledOne({ enabled: '0' }), false);
    assert.equal(isEnabledOne({}), false);
    assert.equal(isEnabledOne(null), false);
  });
});

describe('FR #5079 applyAffiliatesEnabledFilter', () => {
  it('keeps enabled=1, skips enabled=0, skips missing folder, always keeps sql', async () => {
    const logs = [];
    const meta = {
      [providerMarkerKey('rakuten')]: { enabled: '1' },
      [providerMarkerKey('amazon')]: { enabled: '0' },
      // ebay: no folder
    };
    const { queued, skipped } = await applyAffiliatesEnabledFilter(
      ['rakuten', 'amazon', 'ebay', 'sql'],
      {
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in meta)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: meta[Key] };
        },
        log: {
          info: (...a) => {
            logs.push(a.join(' '));
          },
        },
      },
    );
    assert.deepEqual(queued, ['rakuten', 'sql']);
    assert.deepEqual(
      skipped.map((s) => s.id),
      ['amazon', 'ebay'],
    );
    assert.equal(
      skipped.find((s) => s.id === 'amazon').reason,
      'affiliates_enabled_0',
    );
    assert.equal(
      skipped.find((s) => s.id === 'ebay').reason,
      'affiliates_folder_missing',
    );
    assert.ok(logs.some((l) => /skip fan-out amazon:.*enabled=0/.test(l)));
    assert.ok(logs.some((l) => /skip fan-out ebay:.*missing/.test(l)));
  });
});

describe('FR #5079 handleAgentSearch affiliates gate', () => {
  it('queues enabled=1 provider + sql; skips enabled=0 and missing', async () => {
    const sent = [];
    const logs = [];
    const clubs = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const affiliates = {
      [providerMarkerKey('ebay')]: { enabled: '1' },
      [providerMarkerKey('amazon')]: { enabled: '0' },
      // cj missing
    };
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
      env: {
        A_SEARCH_AGENT_API_KEY: FAKE_KEY,
        SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon.fifo',
        SQS_CJ_LIVE_URL: 'https://sqs.example/cj.fifo',
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
      },
      headObject: async ({ Key }) => {
        if (!(Key in clubs)) {
          const err = new Error('missing');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: clubs[Key] };
      },
      headAffiliatesObject: async ({ Key }) => {
        if (!(Key in affiliates)) {
          const err = new Error('missing');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: affiliates[Key] };
      },
      log: {
        info: (...a) => {
          logs.push(a.join(' '));
        },
      },
      sendMessage: async (p) => {
        sent.push(p);
      },
      newSearchId: () => 'srch_5079',
      enabled: () => ['ebay', 'amazon', 'cj'],
      loadRegistry: () => ({
        sources: [
          { id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' },
          {
            id: 'amazon',
            kind: 'live',
            awsSearch: true,
            queueEnv: 'SQS_AMAZON_URL',
          },
          { id: 'cj', kind: 'live', awsSearch: true, queueEnv: 'SQS_CJ_URL' },
        ],
      }),
    });
    assert.deepEqual(result.queued, ['ebay', 'sql']);
    assert.deepEqual(
      sent.map((s) => s.source),
      ['ebay', 'sql'],
    );
    assert.ok(logs.some((l) => /amazon/.test(l) && /enabled=0/.test(l)));
    assert.ok(logs.some((l) => /cj/.test(l) && /missing/.test(l)));
  });
});

describe('FR #5079 docs + shared pack', () => {
  it('search-fanout.md documents a-affiliates enabled gate', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(text, /a-affiliates/);
    assert.match(text, /enabled=1/);
    assert.match(text, /FR #5079/);
  });

  it('entry stack wires A_AFFILIATES_BUCKET + GetObject on a-affiliates/*', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(src, /A_AFFILIATES_BUCKET/);
    assert.match(src, /AgentSearchAffiliatesEnabled/);
    assert.match(src, /arn:aws:s3:::a-affiliates\/\*/);
  });

  it('shared/package.json files[] lists enabledFlag.js', () => {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'shared', 'package.json'),
        'utf8',
      ),
    );
    assert.ok(pkg.files.includes('enabledFlag.js'));
  });

  it('resolveFanOutTargets remains registry+queue only (filter is separate)', () => {
    const targets = resolveFanOutTargets('live', {
      enabled: () => ['ebay', 'amazon'],
      loadRegistry: () => ({
        sources: [
          { id: 'ebay', kind: 'live', awsSearch: true },
          { id: 'amazon', kind: 'live', awsSearch: true },
        ],
      }),
    });
    assert.deepEqual(targets, ['ebay', 'amazon', 'sql']);
  });
});

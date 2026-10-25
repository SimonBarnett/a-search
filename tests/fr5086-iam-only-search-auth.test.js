'use strict';

/**
 * FR #5086: /search agent fan-out trusts API Gateway IAM; no x-agent-api-key.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleAgentSearch,
  noteSearchCaller,
} = require('../entry/src/agentSearch');
const { handleSearch } = require('../entry/src/index');

const ROOT = path.join(__dirname, '..');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function iamEvent(body) {
  return {
    headers: { 'content-type': 'application/json' },
    body,
    requestContext: {
      authorizer: {
        iam: {
          userArn: 'arn:aws:iam::123456789012:user/a-search-redqueen-annotator',
        },
      },
    },
  };
}

describe('FR #5086 IAM-only /search auth', () => {
  it('noteSearchCaller returns IAM ARN and handleAgentSearch accepts no agent key', async () => {
    const logs = [];
    const noted = noteSearchCaller(iamEvent({}), {
      log: { info: (...a) => logs.push(a.join(' ')) },
    });
    assert.equal(noted.iam, true);
    assert.match(noted.userId, /a-search-redqueen-annotator/);
    assert.ok(logs.some((l) => /iam caller/.test(l)));

    const sent = [];
    const meta = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const result = await handleAgentSearch({
      event: iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['boots'],
        exclude: [],
      }),
      env: {
        SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
      },
      headObject: async ({ Key }) => {
        if (!(Key in meta)) {
          const err = new Error('missing');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: meta[Key] };
      },
      headAffiliatesObject: async ({ Key }) => {
        if (Key === 'ebay/') return { Metadata: { enabled: '1' } };
        const err = new Error('missing');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      },
      sendMessage: async (p) => {
        sent.push(p);
      },
      newSearchId: () => 'srch_5086',
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [
          { id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' },
        ],
      }),
      log: { info: () => {} },
    });
    assert.equal(result.searchid, 'srch_5086');
    assert.deepEqual(result.queued, ['ebay', 'sql']);
    assert.equal(sent.length, 2);
  });

  it('handleSearch agent body without agent key returns 202 under IAM', async () => {
    const meta = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const res = await handleSearch(
      iamEvent(
        JSON.stringify({
          hostkey: 'club.example',
          guid: GUID,
          queries: ['q1'],
        }),
      ),
      {
        env: {
          SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in meta)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: meta[Key] };
        },
        headAffiliatesObject: async () => ({ Metadata: { enabled: '1' } }),
        sendMessage: async () => {},
        newSearchId: () => 'srch_5086b',
        enabled: () => ['ebay'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'ebay',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_EBAY_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.equal(body.searchid, 'srch_5086b');
  });

  it('CDK pins HttpIamAuthorizer on /search and /selftest', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /HttpIamAuthorizer/);
    assert.match(stack, /path: '\/search'/);
    assert.match(stack, /path: '\/selftest'/);
    assert.match(stack, /authorizer: searchIamAuthorizer/);
  });

  it('docs and tools drop agent-key requirement for /search', () => {
    const fanout = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(fanout, /FR #5086/);
    assert.match(fanout, /does \*\*not\*\* require `x-agent-api-key`/);
    const tools = fs.readFileSync(
      path.join(ROOT, 'tools', 'Invoke-FolderSearch.ps1'),
      'utf8',
    );
    assert.match(tools, /FR #5086/);
    assert.doesNotMatch(tools, /throw 'agent_api_key_required/);
    assert.doesNotMatch(tools, /'x-agent-api-key'/);
    const example = fs.readFileSync(
      path.join(ROOT, 'tools', 'folder-tools.config.example.json'),
      'utf8',
    );
    assert.doesNotMatch(example, /AgentApiKeyEnv/);
  });
});

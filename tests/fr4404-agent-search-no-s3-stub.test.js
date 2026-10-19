'use strict';

/**
 * FR #4404: entry must not inject a throwing headObject stub — that blocks
 * defaultAclubsIo() and every agent POST /search returns 500 s3_required.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  setAclubsIoFactoryForTests,
  AgentSearchError,
} = require('../entry/src/agentSearch');
const { handleSearch } = require('../entry/src/index');

const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const FAKE_KEY = 'FAKE_agent_api_key_for_tests_only_32b';

function notFound() {
  const err = new Error('missing');
  err.name = 'NotFound';
  err.$metadata = { httpStatusCode: 404 };
  return err;
}

afterEach(() => {
  setAclubsIoFactoryForTests(null);
});

describe('FR #4404 agent search without injected S3', () => {
  it('fail-when: no deps.headObject yields 404 guid_not_found, not 500 s3_required', async () => {
    setAclubsIoFactoryForTests(() => ({
      headObject: async () => {
        throw notFound();
      },
      getObject: async () => {
        throw notFound();
      },
      putObject: async () => {},
    }));

    const res = await handleSearch(
      {
        headers: { 'x-agent-api-key': FAKE_KEY },
        body: JSON.stringify({
          hostkey: 'www.mymodelflyingclub.co.uk',
          guid: GUID,
          queries: ['trainer'],
        }),
      },
      {
        env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
        sendMessage: async () => {},
        // Intentionally omit headObject / getObject / putObject (production shape).
      },
    );

    assert.notEqual(
      JSON.parse(res.body).error,
      's3_required',
      'throwing headObject stub must not block defaultAclubsIo',
    );
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error, 'guid_not_found');
    assert.equal(JSON.parse(res.body).accepted, false);
  });

  it('injected headObject still wins over default factory', async () => {
    setAclubsIoFactoryForTests(() => {
      throw new Error('defaultAclubsIo must not run when headObject injected');
    });
    await assert.rejects(
      () =>
        require('../entry/src/agentSearch').handleAgentSearch({
          event: {
            headers: { 'x-agent-api-key': FAKE_KEY },
            body: {
              hostkey: 'club.example',
              guid: GUID,
              queries: [],
            },
          },
          env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
          headObject: async () => {
            throw notFound();
          },
          sendMessage: async () => {},
        }),
      (e) => e instanceof AgentSearchError && e.code === 'guid_not_found',
    );
  });
});

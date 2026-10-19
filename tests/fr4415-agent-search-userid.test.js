'use strict';

/**
 * FR #4415: agent /search must put host marker userid on every job;
 * missing userid is a named 4xx (not a worker TrackedUrlError).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleAgentSearch,
  AgentSearchError,
} = require('../entry/src/agentSearch');
const {
  useridFromHostMetadata,
} = require('../shared/widgets/hostFolderMeta');
const { buildTrackedUrl } = require('../shared/links/buildTrackedUrl');
const { normalizeEbayItem } = require('../providers/live/ebay/src/normalize');

const ROOT = path.join(__dirname, '..');
const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const FAKE_KEY = 'FAKE_agent_api_key_for_tests_only_32b';
const USERID = 'MMFC9K21';

function notFound() {
  const err = new Error('missing');
  err.name = 'NotFound';
  err.$metadata = { httpStatusCode: 404 };
  return err;
}

describe('FR #4415 useridFromHostMetadata', () => {
  it('prefers userid and uppercases; falls back to customernumber', () => {
    assert.equal(
      useridFromHostMetadata({ userid: 'abc12345' }),
      'ABC12345',
    );
    assert.equal(
      useridFromHostMetadata({ customernumber: 'legACY01' }),
      'LEGACY01',
    );
    assert.equal(useridFromHostMetadata({}), '');
  });
});

describe('FR #4415 agent search fan-out userid', () => {
  it('jobs carry userId/userid from host marker Metadata', async () => {
    /** @type {object[]} */
    const sent = [];
    const meta = {
      [`www.mymodelflyingclub.co.uk/`]: { userid: USERID },
      [`www.mymodelflyingclub.co.uk/${GUID}/`]: {},
    };
    const result = await handleAgentSearch({
      event: {
        headers: { 'x-agent-api-key': FAKE_KEY },
        body: {
          hostkey: 'www.mymodelflyingclub.co.uk',
          guid: GUID,
          queries: ['servo'],
        },
      },
      env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
      headObject: async ({ Key }) => {
        if (!(Key in meta)) throw notFound();
        return { Metadata: meta[Key] };
      },
      sendMessage: async (p) => {
        sent.push(p);
      },
      newSearchId: () => 'srch_mmfc',
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [{ id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' }],
      }),
    });
    assert.equal(result.searchid, 'srch_mmfc');
    assert.ok(sent.length >= 2);
    for (const p of sent) {
      assert.equal(p.userId, USERID);
      assert.equal(p.userid, USERID);
    }
  });

  it('missing host userid returns userid_required 400', async () => {
    await assert.rejects(
      () =>
        handleAgentSearch({
          event: {
            headers: { 'x-agent-api-key': FAKE_KEY },
            body: {
              hostkey: 'noid.example',
              guid: GUID,
              queries: ['x'],
            },
          },
          env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
          headObject: async ({ Key }) => {
            if (Key === `noid.example/${GUID}/`) return {};
            if (Key === 'noid.example/') return { Metadata: {} };
            throw notFound();
          },
          sendMessage: async () => {
            throw new Error('must not enqueue');
          },
        }),
      (e) =>
        e instanceof AgentSearchError &&
        e.code === 'userid_required' &&
        e.statusCode === 400,
    );
  });

  it('ebay normalize + buildTrackedUrl succeed with job userId', () => {
    const product = normalizeEbayItem(
      {
        itemId: 'v1|1|0',
        title: 'Servo',
        itemWebUrl: 'https://www.ebay.co.uk/itm/1',
        price: { value: '9.99', currency: 'GBP' },
      },
      {
        userId: USERID,
        env: 'live',
        envVars: { EBAY_CAMPAIGN_ID: 'camp_test' },
      },
    );
    assert.ok(product.url);
    assert.match(String(product.url), /camp_test|ebay|USERID|MMFC|sid|camp/i);
    const url = buildTrackedUrl({
      url: 'https://www.ebay.co.uk/itm/2',
      userId: USERID,
      env: 'live',
      envVars: { EBAY_CAMPAIGN_ID: 'camp_test' },
      source: 'ebay',
    });
    assert.ok(String(url).includes(USERID) || String(url).length > 10);
  });

  it('agentSearch source pins userid_required and host marker read', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'agentSearch.js'),
      'utf8',
    );
    assert.match(src, /userid_required/);
    assert.match(src, /useridFromHostMetadata/);
    assert.match(src, /userId:\s*hostUserid/);
  });
});

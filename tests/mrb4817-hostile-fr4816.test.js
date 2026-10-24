'use strict';

/**
 * MRB #4817 hostile pins for FR #4816 madeira-identical Creators call.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchAmazonCreators,
  assertCreatorsCreds,
  clearCreatorsTokenCache,
  readCreatorsCreds,
  mintCreatorsAccessToken,
} = require('../providers/live/amazon/src/creatorsSearch');

beforeEach(() => {
  clearCreatorsTokenCache();
});

describe('MRB #4817 hostile FR #4816', () => {
  it('AMAZON_PARTNER_TAG wins over AMAZON_ASSOCIATE_TAG when both set', () => {
    const c = assertCreatorsCreds({
      AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
      AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
      AMAZON_PARTNER_TAG: 'partner-20',
      AMAZON_ASSOCIATE_TAG: 'associate-21',
    });
    assert.equal(c.partnerTag, 'partner-20');
  });

  it('readCreatorsCreds never surfaces AMAZON_CREATORS_CREDENTIAL as bearer', () => {
    const c = readCreatorsCreds({
      AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
      AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
      AMAZON_PARTNER_TAG: 'tag-20',
      AMAZON_CREATORS_CREDENTIAL: 'STATIC_BEARER_OVERRIDE',
    });
    assert.equal(c.credential, '');
  });

  it('401 clears token cache then rethrows (next call remints)', async () => {
    let tokenCalls = 0;
    const env = {
      A_SEARCH_ENV: 'sandbox',
      AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
      AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
      AMAZON_PARTNER_TAG: 'tag-20',
      AMAZON_SEARCH_API: 'creators',
    };
    const httpRequest = async (req) => {
      if (String(req.url).includes('/auth/o2/token')) {
        tokenCalls += 1;
        return { access_token: `FAKE_MINTED_${tokenCalls}`, expires_in: 3600 };
      }
      if (String(req.url).includes('/searchItems')) {
        const err = new Error('Amazon Creators HTTP 401');
        err.status = 401;
        throw err;
      }
      return {};
    };
    await assert.rejects(
      () =>
        searchAmazonCreators(
          { q: 'x', userId: 'U', env: 'sandbox' },
          { env, sleep: async () => {}, httpRequest },
        ),
      (e) => e && e.status === 401,
    );
    assert.equal(tokenCalls, 1);
    // Cache cleared: a fresh mint must hit token URL again (not reuse FAKE_MINTED_1).
    const tok = await mintCreatorsAccessToken(
      {
        accessKey: 'FAKE_CLIENT_ID',
        secretKey: 'FAKE_CLIENT_SECRET',
        tokenUrl: 'https://api.amazon.co.uk/auth/o2/token',
      },
      httpRequest,
    );
    assert.equal(tok, 'FAKE_MINTED_2');
    assert.equal(tokenCalls, 2);
  });

  it('fault log line never includes bearer token or client secret', async () => {
    const logs = [];
    const orig = console.error;
    console.error = (...args) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      await assert.rejects(
        () =>
          searchAmazonCreators(
            { q: 'x', userId: 'U', env: 'sandbox' },
            {
              env: {
                AMAZON_ACCESS_KEY: 'FAKE_CLIENT_ID',
                AMAZON_SECRET_KEY: 'FAKE_CLIENT_SECRET',
                AMAZON_PARTNER_TAG: 'tag-20',
                AMAZON_SEARCH_API: 'creators',
              },
              sleep: async () => {},
              httpRequest: async (req) => {
                if (String(req.url).includes('/auth/o2/token')) {
                  return { access_token: 'FAKE_SECRET_TOKEN', expires_in: 3600 };
                }
                const err = new Error('Amazon Creators HTTP 500');
                err.status = 500;
                throw err;
              },
            },
          ),
        (e) => e && e.status === 500,
      );
    } finally {
      console.error = orig;
    }
    const joined = logs.join('\n');
    assert.match(joined, /amazon creators fault/i);
    assert.doesNotMatch(joined, /FAKE_SECRET_TOKEN/);
    assert.doesNotMatch(joined, /FAKE_CLIENT_SECRET/);
    assert.match(joined, /bearerSource/);
  });
});

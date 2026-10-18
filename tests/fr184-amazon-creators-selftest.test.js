'use strict';

/**
 * FR-184 / #1031: Amazon Creators selftestProbe path (PA-API remains default).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const {
  probeAmazonSelftest,
  DEFAULT_CREATORS_FIXTURE,
  DEFAULT_FIXTURE,
} = require('../providers/live/amazon/src/selftestProbe');

const paapiEnv = {
  AMAZON_ACCESS_KEY: 'AKIATEST',
  AMAZON_SECRET_KEY: 'secret-test',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.co.uk',
  AMAZON_REGION: 'eu-west-1',
  AMAZON_SEARCH_API: 'paapi',
};

const creatorsEnv = {
  AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_CREATORS_ENDPOINT: 'https://example.test/creators/v1/search',
  AMAZON_SEARCH_API: 'creators',
};

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

describe('FR-184 Amazon Creators selftestProbe', () => {
  it('PA-API default still ok on recorded fixture', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const result = await probeAmazonSelftest({ env: paapiEnv });
    assert.equal(result.ok, true);
    assert.equal(result.searchApi, 'paapi');
    assert.equal(result.error, undefined);
  });

  it('Creators flag ok on creators fixture', async () => {
    assert.ok(fs.existsSync(DEFAULT_CREATORS_FIXTURE));
    const result = await probeAmazonSelftest({ env: creatorsEnv });
    assert.equal(result.ok, true);
    assert.equal(result.searchApi, 'creators');
    assert.equal(result.error, undefined);
  });

  it('Creators flag fail-closed missing creds (no HTTP; redacted code)', async () => {
    const httpCalls = [];
    const result = await probeAmazonSelftest({
      env: { AMAZON_SEARCH_API: 'creators', AMAZON_PARTNER_TAG: 'tag-20' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.searchApi, 'creators');
    assert.equal(result.error, 'amazon_creators_missing_credentials');
    assert.equal(httpCalls.length, 0);
    assert.doesNotMatch(String(result.error), /FAKE_|Bearer |secret/i);
  });

  it('Creators injectable httpRequest uses creators endpoint', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_CREATORS_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeAmazonSelftest({
      env: creatorsEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.match(String(req.url), /creators\/v1\/search/);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.searchApi, 'creators');
    assert.equal(calls.length, 1);
  });

  it('FR-184 Decision LOCKED', () => {
    const fr = utf8NoBom('docs/fr/FR-184.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /Creators|AMAZON_SEARCH_API/i);
    assert.match(fr, /selftestProbe|probeAmazonSelftest/);
    assert.match(fr, /PA-API/);
  });
});
